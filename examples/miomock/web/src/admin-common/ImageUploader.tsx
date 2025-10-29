import {
  DistributiveOmit,
  ImageUploaderFrame,
  ImageUploaderFrameProps,
} from "@sonamu-kit/react-sui";
import { FileService } from "src/services/file/file.service";

export type ImageUploaderProps = {} & DistributiveOmit<
  ImageUploaderFrameProps,
  "uploader"
>;
export function ImageUploader(props: ImageUploaderProps) {
  const uploader = async (domFiles: File[]): Promise<string[]> => {
    return await Promise.all(
      domFiles.map(async (domFile) => {
        const response = await FileService.upload(domFile);
        return response.file.url;
      })
    );
  };
  return <ImageUploaderFrame {...props} uploader={uploader} />;
}
