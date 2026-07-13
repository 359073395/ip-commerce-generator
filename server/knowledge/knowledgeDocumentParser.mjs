import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import readExcelFile from 'read-excel-file/node';

const supportedExtensions = new Set(['.txt', '.md', '.csv', '.json', '.docx', '.pdf', '.xlsx']);

export async function parseKnowledgeDocument({ buffer, originalName = '知识资料', mimeType = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw parserError('KNOWLEDGE_FILE_EMPTY', '上传文件为空。');
  }
  const maxBytes = positiveInteger(process.env.KNOWLEDGE_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
  if (buffer.length > maxBytes) {
    throw parserError('KNOWLEDGE_FILE_TOO_LARGE', `文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
  }

  const extension = path.extname(String(originalName || '')).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw parserError('KNOWLEDGE_FILE_UNSUPPORTED', '支持 TXT、Markdown、CSV、JSON、DOCX、PDF 和 XLSX 文件。');
  }

  let text = '';
  const warnings = [];

  if (['.txt', '.md', '.csv', '.json'].includes(extension)) {
    text = buffer.toString('utf8');
    if (extension === '.json') text = formatJsonText(text, warnings);
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
    warnings.push(...(result.messages || []).map((item) => item.message).filter(Boolean).slice(0, 10));
  } else if (extension === '.pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text || '';
    } finally {
      await parser.destroy();
    }
  } else if (extension === '.xlsx') {
    const sheets = await readExcelFile(buffer);
    text = (sheets || []).map((sheet) => {
      const rows = (sheet.data || []).map((row) => row.map(formatCell).join(' | '));
      return [`# 工作表：${sheet.sheet || 'Sheet'}`, ...rows].join('\n');
    }).join('\n\n');
  }

  text = normalizeExtractedText(text);
  if (text.length < 20) {
    throw parserError('KNOWLEDGE_FILE_NO_TEXT', '没有从文件中提取到足够的可学习文字。扫描版 PDF 请先做 OCR。');
  }

  return {
    title: path.basename(originalName, extension).slice(0, 180) || '知识资料',
    originalName: path.basename(originalName).slice(0, 240),
    extension,
    mimeType: String(mimeType || '').slice(0, 160),
    text,
    characters: text.length,
    warnings,
  };
}

export function knowledgeUploadAccept() {
  return [...supportedExtensions].join(',');
}

function formatJsonText(text, warnings) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    warnings.push('JSON 格式不完整，已按普通文本处理。');
    return text;
  }
}

function formatCell(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parserError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
