export class FileSystemAdapter {
    constructor(private basePath: string) {}
    getBasePath() { return this.basePath; }
}
export class TFile {
    constructor(public path: string, public vault: any) {}
    get extension() { return this.path.split('.').pop(); }
}
export class Notice {
    static messages: string[] = [];
    constructor(message: string) { Notice.messages.push(message); }
}
export class MarkdownView {}
export class FuzzySuggestModal {}
export const Platform = {isWin: process.platform === 'win32'};
