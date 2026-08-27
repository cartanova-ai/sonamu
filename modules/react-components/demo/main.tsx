import ReactDOM from "react-dom/client";

import { SonamuProvider } from "../src/contexts";
import { type SonamuFile } from "../src/contexts";

import "../src/styles/globals.css";
import App from "./App";

// Mock uploader 함수
const mockUploader = async (files: File[]): Promise<SonamuFile[]> => {
  return files.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file),
    mime_type: file.type,
    size: file.size,
  }));
};

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("루트 요소를 찾을 수 없습니다.");
}

ReactDOM.createRoot(rootElement).render(
  <SonamuProvider uploader={mockUploader}>
    <App />
  </SonamuProvider>,
);
