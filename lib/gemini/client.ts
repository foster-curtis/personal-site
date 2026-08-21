import { GoogleGenerativeAI, type EmbedContentRequest } from "@google/generative-ai";

// The installed SDK (@google/generative-ai) predates gemini-embedding-001's
// outputDimensionality param, so its EmbedContentRequest type doesn't declare it — but the
// SDK's embedContent() just JSON.stringifies whatever object it's given (no field
// whitelisting), so extending the type and passing a non-literal value (avoiding TS's
// excess-property check) gets it through correctly. Confirmed against the live API: this
// value must stay 768 to match content_embeddings.embedding vector(768) in the DB schema.
interface EmbedContentRequestWithDimensionality extends EmbedContentRequest {
  outputDimensionality?: number;
}
const EMBEDDING_DIMENSIONS = 768;

// Initialize the Gemini client
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

// Get the model name from env or use default
function getModelName() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/**
 * Generate text content using Gemini
 */
export async function generateContent(prompt: string): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: getModelName() });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

/**
 * Generate text content with a system prompt and context
 */
export async function generateWithContext(
  systemPrompt: string,
  context: string,
  userMessage: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: getModelName() });

  const fullPrompt = `${systemPrompt}

Context:
${context}

User question: ${userMessage}

Please answer the user's question based only on the provided context. If the context doesn't contain enough information to answer, say so.`;

  const result = await model.generateContent(fullPrompt);
  const response = await result.response;
  return response.text();
}

/**
 * Generate embeddings for text using Gemini Embedding API
 * Returns a vector of 768 dimensions (using gemini-embedding-001)
 */
export async function embedText(text: string): Promise<number[]> {
  const genAI = getClient();
  // text-embedding-004 (the model this used previously) has been retired — confirmed via
  // the live API's ListModels that it no longer supports embedContent. gemini-embedding-001
  // defaults to 3072 dimensions; outputDimensionality truncates it (Matryoshka
  // representation) to keep compatibility with the existing vector(768) column instead of
  // requiring a schema migration.
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  const request: EmbedContentRequestWithDimensionality = {
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  };
  const result = await model.embedContent(request);
  return result.embedding.values;
}

/**
 * Generate embeddings for multiple texts
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Process sequentially to avoid rate limits
  for (const text of texts) {
    const embedding = await embedText(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Split text into chunks for embedding
 * Splits by paragraphs first, then by sentences if paragraphs are too long
 */
export function chunkText(
  text: string,
  maxChunkLength: number = 1000
): string[] {
  const chunks: string[] = [];

  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkLength) {
      chunks.push(paragraph.trim());
    } else {
      // Split long paragraphs by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let currentChunk = "";

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length + 1 <= maxChunkLength) {
          currentChunk += (currentChunk ? " " : "") + sentence;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          // If a single sentence is too long, split by words
          if (sentence.length > maxChunkLength) {
            const words = sentence.split(/\s+/);
            currentChunk = "";
            for (const word of words) {
              if (currentChunk.length + word.length + 1 <= maxChunkLength) {
                currentChunk += (currentChunk ? " " : "") + word;
              } else {
                if (currentChunk) {
                  chunks.push(currentChunk.trim());
                }
                currentChunk = word;
              }
            }
          } else {
            currentChunk = sentence;
          }
        }
      }

      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
    }
  }

  // If no chunks were created (text has no paragraphs), treat as single chunk
  if (chunks.length === 0 && text.trim().length > 0) {
    if (text.length <= maxChunkLength) {
      chunks.push(text.trim());
    } else {
      // Split by words as last resort
      const words = text.split(/\s+/);
      let currentChunk = "";
      for (const word of words) {
        if (currentChunk.length + word.length + 1 <= maxChunkLength) {
          currentChunk += (currentChunk ? " " : "") + word;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = word;
        }
      }
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
    }
  }

  return chunks;
}
