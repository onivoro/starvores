import { Injectable } from '@nestjs/common';
import { create, insert, remove, search, save, load } from '@orama/orama';
import type { Orama } from '@orama/orama';
import { LinkGraphService } from './link-graph.service';

const SCHEMA = {
  relativePath: 'string',
  title: 'string',
  content: 'string',
} as const;

type OnyvoreIndex = Orama<typeof SCHEMA>;

@Injectable()
export class SearchIndexService {
  private indexes = new Map<string, OnyvoreIndex>();

  constructor(private readonly linkGraphService: LinkGraphService) {}

  async getOrCreateIndex(notebookId: string): Promise<OnyvoreIndex> {
    let index = this.indexes.get(notebookId);
    if (!index) {
      index = await create({ schema: SCHEMA });
      this.indexes.set(notebookId, index);
    }
    return index;
  }

  removeIndex(notebookId: string): void {
    this.indexes.delete(notebookId);
  }

  async addDocument(
    notebookId: string,
    relativePath: string,
    title: string,
    content: string,
  ): Promise<void> {
    const index = await this.getOrCreateIndex(notebookId);
    await insert(index, { relativePath, title, content });
  }

  async updateDocument(
    notebookId: string,
    relativePath: string,
    title: string,
    content: string,
  ): Promise<void> {
    await this.removeDocument(notebookId, relativePath);
    await this.addDocument(notebookId, relativePath, title, content);
  }

  async removeDocument(notebookId: string, relativePath: string): Promise<void> {
    const index = this.indexes.get(notebookId);
    if (!index) return;

    // Search for the document by its relativePath to find its internal ID
    const results = await search(index, {
      term: relativePath,
      properties: ['relativePath'],
      exact: true,
      limit: 1,
    });

    if (results.hits.length > 0) {
      await remove(index, results.hits[0].id);
    }
  }

  async searchNotebook(
    notebookId: string,
    query: string,
    limit = 20,
  ): Promise<Array<{ relativePath: string; title: string; score: number }>> {
    const index = this.indexes.get(notebookId);
    if (!index) return [];

    const results = await search(index, {
      term: query,
      properties: ['title', 'content'],
      tolerance: 1,
      limit: limit * 2, // Fetch extra so we can re-rank
    });

    // Graph-boosted ranking: finalScore = oramaScore * (1 + log2(1 + inboundLinkCount))
    const boosted = results.hits.map((hit) => {
      const doc = hit.document as { relativePath: string; title: string };
      const inboundCount = this.linkGraphService.getInboundCount(
        notebookId,
        doc.relativePath,
      );
      const boost = 1 + Math.log2(1 + inboundCount);
      return {
        relativePath: doc.relativePath,
        title: doc.title,
        score: hit.score * boost,
      };
    });

    boosted.sort((a, b) => b.score - a.score);
    return boosted.slice(0, limit);
  }

  async serialize(notebookId: string): Promise<Buffer | null> {
    const index = this.indexes.get(notebookId);
    if (!index) return null;

    const data = await save(index);
    return Buffer.from(JSON.stringify(data));
  }

  async deserialize(notebookId: string, data: Buffer): Promise<void> {
    const parsed = JSON.parse(data.toString());
    const index = await create({ schema: SCHEMA });
    await load(index, parsed);
    this.indexes.set(notebookId, index);
  }
}
