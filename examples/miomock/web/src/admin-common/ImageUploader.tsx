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
  if (props.mode === "lazy") {
    return <ImageUploaderFrame {...props} mode="lazy" />;
  }

  const uploader = async (domFiles: File[]) => {
    return await Promise.all(
      domFiles.map(async (domFile) => {
        const response = await FileService.upload(domFile);
        return response.file;
      })
    );
  };
  return <ImageUploaderFrame {...props} mode="eager" uploader={uploader} />;
}
