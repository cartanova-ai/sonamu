import {
  type DistributiveOmit,
  ImageUploaderFrame,
  type ImageUploaderFrameProps,
} from "@sonamu-kit/react-sui";
import { FileService } from "@/services/services.generated";

export type ImageUploaderProps = {} & DistributiveOmit<ImageUploaderFrameProps, "uploader">;

export function ImageUploader(props: ImageUploaderProps) {
  if (props.multiple) {
    return (
      <ImageUploaderFrame
        {...props}
        uploader={async (domFiles: File[]) => {
          const response = await FileService.uploadMultiple(domFiles);
          return response.files;
        }}
      />
    );
  } else {
    return (
      <ImageUploaderFrame
        {...props}
        uploader={async (domFile: File) => {
          const response = await FileService.upload(domFile);
          return response.file;
        }}
      />
    );
  }
}
