import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;

const getPipeline = (): Promise<FeatureExtractionPipeline> => {
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", MODEL_ID) as Promise<FeatureExtractionPipeline>;
  }
  return pipelinePromise;
};

/** Lazy singleton: mean pooling + L2 normalize → unit Float32Array (dim 384). */
export const embed = async (text: string): Promise<Float32Array> => {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const data = output.data as Float32Array | number[];
  return data instanceof Float32Array ? new Float32Array(data) : Float32Array.from(data);
};

/** Test helper: exposed pipeline promise identity for singleton checks. */
export const getEmbedPipelinePromise = (): Promise<FeatureExtractionPipeline> | undefined => pipelinePromise;

export const resetEmbedPipelineForTests = (): void => {
  pipelinePromise = undefined;
};
