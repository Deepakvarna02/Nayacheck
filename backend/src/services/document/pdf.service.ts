import fs from 'fs/promises';
import pdfParse from 'pdf-parse';

export const pdfService = {
  async extractText(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  },

  async extractPages(filePath: string): Promise<string[]> {
    const buffer = await fs.readFile(filePath);
    const pages: string[] = [];

    await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        });
        const pageText = textContent.items
          .map((item: { str?: string }) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pages.push(pageText);
        return pageText;
      }
    });

    return pages;
  }
};
