import { DEFAULT_VECTOR_CONFIG } from "./config";
import { type Chunk, type ChunkingConfig } from "./types";

interface ExtractedChunk {
  chunk: string;
  length: number;
}

/**
 * 텍스트 청킹
 * - 현재 가이드에서는 400토큰 이하만 저장하므로 기본적으로 사용하지 않음
 * - 추후 긴 문서 처리 시 사용
 */
export class Chunking {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_VECTOR_CONFIG.chunking, ...config };
  }

  /**
   * 텍스트를 청크로 분할
   */
  chunk(text: string): Chunk[] {
    if (text.length < this.config.skipThreshold) {
      return [
        {
          index: 0,
          text: text.trim(),
          startOffset: 0,
          endOffset: text.length,
        },
      ];
    }

    const chunks: Chunk[] = [];
    let currentPosition = 0;

    while (currentPosition < text.length) {
      const remainingText = text.slice(currentPosition);
      const { chunk, length } = this.extractChunk(remainingText);

      if (chunk.trim().length >= this.config.minChunkSize) {
        chunks.push({
          index: chunks.length,
          text: chunk.trim(),
          startOffset: currentPosition,
          endOffset: currentPosition + length,
        });
      }

      const advance = Math.max(length - this.config.chunkOverlap, this.config.minChunkSize);
      currentPosition += advance;
    }

    return chunks;
  }

  /**
   * 청킹이 필요한지 확인
   */
  needsChunking(text: string): boolean {
    return text.length > this.config.chunkSize;
  }

  /**
   * 예상 청크 수 계산
   */
  estimateChunkCount(text: string): number {
    if (text.length <= this.config.chunkSize) {
      return 1;
    }
    const effectiveChunkSize = this.config.chunkSize - this.config.chunkOverlap;
    return Math.ceil(text.length / effectiveChunkSize);
  }

  private extractChunk(text: string): ExtractedChunk {
    if (text.length <= this.config.chunkSize) {
      return { chunk: text, length: text.length };
    }

    for (const separator of this.config.separators) {
      const result = this.splitBySeparator(text, separator);
      if (result) return result;
    }

    return {
      chunk: text.slice(0, this.config.chunkSize),
      length: this.config.chunkSize,
    };
  }

  private splitBySeparator(
    text: string,
    separator: string,
  ): { chunk: string; length: number } | null {
    const searchRange = text.slice(0, this.config.chunkSize + 100);

    let lastIndex = -1;
    let index = 0;

    while (true) {
      index = searchRange.indexOf(separator, index);
      if (index === -1) break;
      if (index <= this.config.chunkSize) {
        lastIndex = index + separator.length;
      }
      index++;
    }

    if (lastIndex > this.config.minChunkSize) {
      return {
        chunk: text.slice(0, lastIndex),
        length: lastIndex,
      };
    }

    return null;
  }
}
