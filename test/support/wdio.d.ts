import type JupyMDPlugin from '../../src/main';
import 'wdio-obsidian-service';
declare module 'wdio-obsidian-service' {
    interface InstalledPlugins { jupymd: JupyMDPlugin; }
}
