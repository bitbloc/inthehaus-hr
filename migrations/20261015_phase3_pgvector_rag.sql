-- Migration: Phase 3 pgvector & Native Knowledge Search
-- Purpose: Enable PostgreSQL vector extension and RPC match function for sub-15ms semantic search.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop existing function signatures to allow return type update (fixes Error 42P13)
DROP FUNCTION IF EXISTS match_yuzu_knowledge(vector, float, int) CASCADE;
DROP FUNCTION IF EXISTS match_yuzu_knowledge(vector, double precision, integer) CASCADE;
DROP FUNCTION IF EXISTS match_yuzu_knowledge CASCADE;

-- 3. Create HNSW index for high-speed vector similarity search
CREATE INDEX IF NOT EXISTS idx_yuzu_knowledge_embedding_hnsw 
ON yuzu_knowledge 
USING hnsw (embedding vector_cosine_ops);

-- 4. Create optimized match_yuzu_knowledge RPC function (with id as uuid)
CREATE OR REPLACE FUNCTION match_yuzu_knowledge (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    yuzu_knowledge.id,
    yuzu_knowledge.content,
    yuzu_knowledge.metadata,
    (1 - (yuzu_knowledge.embedding <=> query_embedding))::float AS similarity
  FROM yuzu_knowledge
  WHERE yuzu_knowledge.embedding IS NOT NULL
    AND (1 - (yuzu_knowledge.embedding <=> query_embedding)) > match_threshold
  ORDER BY yuzu_knowledge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
