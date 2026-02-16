import { env } from "../env";

export const extractTextFromImage = async (imageBase64: string): Promise<string> => {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${env.GCP_VISION_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vision API error: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const ocrText =
    data?.responses?.[0]?.fullTextAnnotation?.text ??
    data?.responses?.[0]?.textAnnotations?.[0]?.description ??
    "";

  if (!ocrText.trim()) {
    throw new Error("No OCR text detected");
  }

  return ocrText;
};
