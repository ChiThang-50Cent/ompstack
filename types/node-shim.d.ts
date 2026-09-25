declare const process: {
  pid: number;
  platform: string;
};

declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(value: unknown): any;
    digest(encoding: "hex"): string;
  };
  export function randomBytes(size: number): { toString(encoding: "hex"): string };
  export function randomUUID(): string;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function createReadStream(path: string): {
    on(event: string, listener: (...args: any[]) => void): any;
  };
}

declare module "node:fs/promises" {
  export function appendFile(path: string, data: string, encoding?: string): Promise<void>;
  export function copyFile(src: string, dest: string): Promise<void>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function mkdir(path: string, options?: Record<string, unknown>): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function lstat(path: string): Promise<{ size: number; mtimeMs: number }>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Array<{
    name: string;
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    isFile(): boolean;
  }>>;
}

declare module "node:path" {
  const path: {
    sep: string;
    resolve(...parts: string[]): string;
    join(...parts: string[]): string;
    relative(from: string, to: string): string;
    dirname(value: string): string;
    isAbsolute(value: string): boolean;
  };
  export default path;
  export const resolve: typeof path.resolve;
  export const join: typeof path.join;
  export const relative: typeof path.relative;
  export const dirname: typeof path.dirname;
  export const isAbsolute: typeof path.isAbsolute;
}

declare module "node:util" {
  export function promisify(fn: (...args: any[]) => any): (...args: any[]) => Promise<any>;
}

declare module "node:child_process" {
  export function execFile(command: string, args: string[], options: Record<string, unknown>, callback: (...args: any[]) => void): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}
