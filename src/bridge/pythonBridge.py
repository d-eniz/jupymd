import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import traceback

from jupyter_client import KernelManager
from jupyter_client.kernelspec import KernelSpecManager

sessions = {}
sessions_lock = threading.RLock()
output_lock = threading.Lock()
managed_kernels_dir = (
    os.path.realpath(os.path.join(sys.argv[1], "kernels"))
    if len(sys.argv) > 1 and sys.argv[1]
    else None
)


def emit(payload):
    with output_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def kernel_spec_manager():
    manager = KernelSpecManager()
    if managed_kernels_dir and managed_kernels_dir not in manager.kernel_dirs:
        manager.kernel_dirs.insert(0, managed_kernels_dir)
    return manager


def list_kernels():
    all_specs = kernel_spec_manager().get_all_specs()
    result = []
    for name, item in all_specs.items():
        spec = item.get("spec", {})
        metadata = spec.get("metadata", {}) or {}
        jupymd_metadata = metadata.get("jupymd", {}) if isinstance(metadata, dict) else {}
        if not isinstance(jupymd_metadata, dict):
            jupymd_metadata = {}
        argv = spec.get("argv", [])
        interpreter = None
        if isinstance(jupymd_metadata, dict):
            interpreter = jupymd_metadata.get("interpreter")
        if not interpreter and spec.get("language", "").lower() == "python" and argv:
            candidate = os.path.expandvars(os.path.expanduser(str(argv[0])))
            if os.path.isabs(candidate):
                interpreter = os.path.realpath(candidate)
            else:
                spec_env = spec.get("env", {}) if isinstance(spec.get("env", {}), dict) else {}
                interpreter = shutil.which(candidate, path=spec_env.get("PATH")) or candidate
        result.append({
            "id": "jupyter:" + name,
            "name": name,
            "displayName": spec.get("display_name", name),
            "language": spec.get("language", ""),
            "resourceDir": item.get("resource_dir", ""),
            "spec": spec,
            "source": "python-environment" if jupymd_metadata.get("managed") else "jupyter",
            "interpreterPath": interpreter,
            "isManaged": bool(jupymd_metadata.get("managed")),
        })
    result.sort(key=lambda item: (item["displayName"].lower(), item["name"].lower()))
    return result


def close_session(session_key):
    with sessions_lock:
        session = sessions.pop(session_key, None)
    if not session:
        return
    try:
        session["client"].stop_channels()
    except Exception:
        pass
    try:
        session["manager"].shutdown_kernel(now=True)
    except Exception:
        pass


def get_session(session_key, kernel_name, cwd):
    with sessions_lock:
        existing = sessions.get(session_key)
        if existing and existing["kernel_name"].lower() == kernel_name.lower():
            return existing

    if existing:
        close_session(session_key)

    manager = KernelManager(kernel_name=kernel_name, kernel_spec_manager=kernel_spec_manager())
    manager.start_kernel(cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    client = manager.client()
    client.start_channels()
    try:
        client.wait_for_ready(timeout=20)
    except Exception:
        try:
            client.stop_channels()
        except Exception:
            pass
        manager.shutdown_kernel(now=True)
        raise

    session = {
        "manager": manager,
        "client": client,
        "kernel_name": kernel_name,
        "lock": threading.Lock(),
    }
    with sessions_lock:
        sessions[session_key] = session
    return session


def apply_clear(outputs, display_indexes, wait):
    if not wait:
        outputs.clear()
        display_indexes.clear()
    return wait


def execute_code(session_key, kernel_name, cwd, code, timeout):
    session = get_session(session_key, kernel_name, cwd)
    client = session["client"]
    outputs = []
    display_indexes = {}
    clear_on_next_output = False
    deadline = time.monotonic() + timeout

    with session["lock"]:
        message_id = client.execute(
            code,
            silent=False,
            store_history=True,
            allow_stdin=False,
            stop_on_error=True,
        )

        idle = False
        while not idle:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Kernel execution timed out")
            try:
                message = client.get_iopub_msg(timeout=min(1.0, remaining))
            except queue.Empty:
                continue

            parent_id = message.get("parent_header", {}).get("msg_id")
            if parent_id != message_id:
                continue

            message_type = message.get("msg_type") or message.get("header", {}).get("msg_type")
            content = message.get("content", {})

            if message_type == "status" and content.get("execution_state") == "idle":
                idle = True
                continue
            if message_type in ("status", "execute_input"):
                continue
            if message_type == "clear_output":
                clear_on_next_output = apply_clear(outputs, display_indexes, bool(content.get("wait")))
                continue

            if clear_on_next_output:
                outputs.clear()
                display_indexes.clear()
                clear_on_next_output = False

            if message_type == "stream":
                outputs.append({
                    "output_type": "stream",
                    "name": content.get("name", "stdout"),
                    "text": content.get("text", ""),
                })
            elif message_type in ("display_data", "execute_result"):
                output = {
                    "output_type": message_type,
                    "data": content.get("data", {}),
                    "metadata": content.get("metadata", {}),
                }
                if message_type == "execute_result":
                    output["execution_count"] = content.get("execution_count")
                outputs.append(output)
                display_id = content.get("transient", {}).get("display_id")
                if display_id:
                    display_indexes[display_id] = len(outputs) - 1
            elif message_type == "update_display_data":
                display_id = content.get("transient", {}).get("display_id")
                index = display_indexes.get(display_id)
                if index is not None:
                    outputs[index]["data"] = content.get("data", {})
                    outputs[index]["metadata"] = content.get("metadata", {})
            elif message_type == "error":
                outputs.append({
                    "output_type": "error",
                    "ename": content.get("ename", "Error"),
                    "evalue": content.get("evalue", ""),
                    "traceback": content.get("traceback", []),
                })

        reply = None
        while reply is None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Timed out waiting for execute reply")
            try:
                candidate = client.get_shell_msg(timeout=min(1.0, remaining))
            except queue.Empty:
                continue
            if candidate.get("parent_header", {}).get("msg_id") == message_id:
                reply = candidate

        content = reply.get("content", {})
        return {
            "outputs": outputs,
            "executionCount": content.get("execution_count"),
        }


def execute_worker(request):
    request_id = request.get("id")
    try:
        result = execute_code(
            request["sessionKey"],
            request["kernelName"],
            request["cwd"],
            request.get("code", ""),
            float(request.get("timeout", 300)),
        )
        emit({"id": request_id, "ok": True, "result": result})
    except Exception as error:
        emit({
            "id": request_id,
            "ok": False,
            "error": str(error),
            "details": traceback.format_exc(),
        })


def handle(request):
    operation = request.get("operation")
    if operation == "list_kernels":
        return list_kernels()
    if operation == "execute":
        thread = threading.Thread(target=execute_worker, args=(request,), daemon=True)
        thread.start()
        return None
    if operation == "interrupt":
        with sessions_lock:
            session = sessions.get(request["sessionKey"])
        if session:
            session["manager"].interrupt_kernel()
        return {"interrupted": bool(session)}
    if operation == "restart":
        with sessions_lock:
            session = sessions.get(request["sessionKey"])
        if not session:
            return {"restarted": False}
        with session["lock"]:
            session["manager"].restart_kernel(now=True)
            session["client"].wait_for_ready(timeout=20)
        return {"restarted": True}
    if operation == "shutdown":
        close_session(request["sessionKey"])
        return {"shutdown": True}
    if operation == "shutdown_all":
        with sessions_lock:
            keys = list(sessions.keys())
        for key in keys:
            close_session(key)
        return {"shutdown": True}
    raise ValueError("Unknown bridge operation: " + str(operation))


emit({"event": "ready"})
try:
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        request = None
        try:
            request = json.loads(raw_line)
            result = handle(request)
            if result is not None:
                emit({"id": request.get("id"), "ok": True, "result": result})
        except Exception as error:
            emit({
                "id": request.get("id") if isinstance(request, dict) else None,
                "ok": False,
                "error": str(error),
                "details": traceback.format_exc(),
            })
finally:
    with sessions_lock:
        keys = list(sessions.keys())
    for key in keys:
        close_session(key)
