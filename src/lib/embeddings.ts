// src/lib/embeddings.ts
import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replaceAll("\n", " ");

  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: input,
    providerOptions: {
      google: {
        outputDimensionality: 768,
      },
    },
  });

  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((text) => text.replaceAll("\n", " "));

  // Google's embedding API only accepts up to 100 items per batch request
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      values: batch,
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}