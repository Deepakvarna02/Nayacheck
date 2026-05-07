import fs from 'fs/promises';

export const imageService = {
  async toBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }
};
