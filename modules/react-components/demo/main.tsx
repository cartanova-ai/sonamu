import ReactDOM from "react-dom/client";

import { type SonamuFile, SonamuProvider } from "../src/contexts";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SonamuProvider uploader={mockUploader}>
    <App />
  </SonamuProvider>,
);
