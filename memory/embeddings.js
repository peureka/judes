let pipeline = null;
let loading = null;

async function loadModel() {
  const { pipeline: createPipeline } = await import("@xenova/transformers");
  pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  console.log("embedding model ready.");
}

export function warmup() {
  if (!loading) {
    loading = loadModel().catch((err) => {
      console.error("embedding model failed to load:", err.message);
      loading = null;
    });
  }
  return loading;
}

export async function embed(text) {
  if (!pipeline) await warmup();
  const result = await pipeline(text, { pooling: "mean", normalize: true });
  return Array.from(result.data);
}

export function toVector(arr) {
  return `[${arr.join(",")}]`;
}
