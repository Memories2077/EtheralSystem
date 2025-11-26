// src/utils/fs.ts
import fs from 'fs-extra';
import path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
}

export async function writeFileSafe(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);
    await fs.writeFile(filePath, content, 'utf8');
}

export async function readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf8');
}

export async function exists(filePath: string): Promise<boolean> {
    return fs.pathExists(filePath);
}

export async function remove(filePath: string): Promise<void> {
    await fs.remove(filePath);
}

export async function copy(src: string, dest: string): Promise<void> {
    await fs.copy(src, dest);
}
