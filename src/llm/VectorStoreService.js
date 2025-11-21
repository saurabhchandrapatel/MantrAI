const { ChromaClient } = require("chromadb");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const path = require('path');
const fs = require('fs');
// const pdf = require('pdf-parse');

class VectorStoreService {
    constructor() {
        this.client = new ChromaClient({
            path: "http://localhost:8000" // Default Chroma local server
        });
        this.collectionName = "yobup_documents";
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY
        });
        this.collection = null;
        this._init();
    }

    async _init() {
        try {
            this.collection = await this.client.getOrCreateCollection({
                name: this.collectionName,
            });
            console.log(`[VectorStore] Connected to collection: ${this.collectionName}`);
        } catch (err) {
            console.error("[VectorStore] Initialization error:", err);
            // Fallback or retry logic could go here
        }
    }

    async addDocument(filePath) {
        try {
            const content = await this.extractText(filePath);
            if (!content) throw new Error("Failed to extract text");

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200,
            });

            const docs = await splitter.createDocuments([content]);
            const ids = docs.map((_, i) => `${path.basename(filePath)}-${Date.now()}-${i}`);
            const metadatas = docs.map((_, i) => ({ source: filePath, chunk: i }));
            const texts = docs.map(d => d.pageContent);

            // Generate embeddings
            // Note: Chroma JS client might handle embeddings if we pass an embedding function, 
            // but here we might need to generate them explicitly if using raw client, 
            // OR use LangChain's Chroma wrapper. 
            // Let's use LangChain's Chroma wrapper for easier integration if possible, 
            // but for now, let's stick to the raw client + manual embedding for control 
            // OR better: use the raw client and let it handle it if we configure it?
            // Actually, simpler to use LangChain's Chroma integration if we installed @langchain/community.
            // But let's stick to the plan of using the raw client for now to ensure we control the server connection,
            // or use the embeddings to generate vectors.

            const vectors = await this.embeddings.embedDocuments(texts);

            await this.collection.add({
                ids: ids,
                embeddings: vectors,
                metadatas: metadatas,
                documents: texts,
            });

            console.log(`[VectorStore] Added ${docs.length} chunks from ${filePath}`);
            return { success: true, chunks: docs.length };
        } catch (err) {
            console.error("[VectorStore] Error adding document:", err);
            return { success: false, error: err.message };
        }
    }

    async extractText(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        try {
            if (ext === '.pdf') {
                // const dataBuffer = fs.readFileSync(filePath);
                // const data = await pdf(dataBuffer);
                // return data.text;
                console.warn("PDF support temporarily disabled");
                return null;
            } else if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.js') {
                return fs.readFileSync(filePath, 'utf8');
            }
            return null;
        } catch (err) {
            console.error(`[VectorStore] Text extraction failed for ${filePath}:`, err);
            return null;
        }
    }

    async query(queryText, k = 3) {
        try {
            if (!this.collection) await this._init();

            const queryEmbedding = await this.embeddings.embedQuery(queryText);

            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: k,
            });

            // Results structure: { ids, distances, metadatas, documents }
            // We want to return a clean list of matches
            const matches = [];
            if (results.ids && results.ids.length > 0) {
                const firstBatch = results.ids[0]; // Since we sent 1 query
                for (let i = 0; i < firstBatch.length; i++) {
                    matches.push({
                        id: results.ids[0][i],
                        text: results.documents[0][i],
                        metadata: results.metadatas[0][i],
                        score: results.distances ? results.distances[0][i] : null
                    });
                }
            }
            return matches;
        } catch (err) {
            console.error("[VectorStore] Query error:", err);
            return [];
        }
    }

    async reset() {
        try {
            await this.client.deleteCollection({ name: this.collectionName });
            await this._init();
            return true;
        } catch (err) {
            console.error("[VectorStore] Reset error:", err);
            return false;
        }
    }
}

module.exports = VectorStoreService;
