import {readFile} from "node:fs/promises";

const bundle = await readFile(new URL("../main.js", import.meta.url), "utf8");
const dynamicScriptCreation = /\.createElement\(\s*["']script["']/g;
const environmentAccess = /process\.env(?:\.|\[)/g;
const identityApiAccess = /\.(?:hostname|userInfo|networkInterfaces|homedir)\(/g;
const scriptMatches = bundle.match(dynamicScriptCreation) || [];
const environmentMatches = bundle.match(environmentAccess) || [];
const identityMatches = bundle.match(identityApiAccess) || [];

if (scriptMatches.length > 0) {
	throw new Error(
		`Release bundle contains ${scriptMatches.length} dynamic <script> element creation(s).`
	);
}

if (environmentMatches.length > 0) {
	throw new Error(
		`Release bundle contains ${environmentMatches.length} direct environment-variable access(es).`
	);
}

if (identityMatches.length > 0) {
	throw new Error(
		`Release bundle contains ${identityMatches.length} system identity API call(s).`
	);
}

console.log("Release bundle review check passed.");
