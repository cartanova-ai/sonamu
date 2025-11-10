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
    if (props.multiple) {
      const response = await FileService.uploadMultiple(domFiles);
      return response.files;
    } else {
      const response = await FileService.upload(domFiles[0]);
      return [response.file];
    }
  };

  return <ImageUploaderFrame {...props} mode="eager" uploader={uploader} />;
}
