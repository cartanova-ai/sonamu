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
      <div className="image-uploader-wrapper">
        <ImageUploaderFrame
          {...props}
          uploader={async (domFiles: File[]) => {
            const response = await FileService.uploadMultiple(domFiles);
            return response.files;
          }}
        />
        <style>{`
          .image-uploader-wrapper .ui.button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            font-weight: 400;
            padding: 0.6rem 1.2rem;
            transition: all 0.2s;
            cursor: pointer;
            border: 1px solid rgba(34, 36, 38, 0.15);
            background-color: #e0e1e2;
            color: rgba(0, 0, 0, 0.6);
            box-shadow: 0 0 0 0 rgba(34, 36, 38, 0.15) inset;
          }
          .image-uploader-wrapper .ui.button:hover {
            background-color: #cacbcd;
            color: rgba(0, 0, 0, 0.8);
          }
          .image-uploader-wrapper .ui.button.primary {
            background-color: #2185d0;
            color: white;
            border-color: #2185d0;
            text-shadow: none;
          }
          .image-uploader-wrapper .ui.button.primary:hover {
            background-color: #1678c2;
            border-color: #1678c2;
          }
          .image-uploader-wrapper .ui.button.negative {
            background-color: #db2828;
            color: white;
            border-color: #db2828;
            text-shadow: none;
          }
          .image-uploader-wrapper .ui.button.negative:hover {
            background-color: #d01919;
            border-color: #d01919;
          }
          .image-uploader-wrapper .ui.buttons {
            display: inline-flex;
            gap: 0.25rem;
          }
          .image-uploader-wrapper .ui.segment {
            border: 2px dashed rgba(34, 36, 38, 0.15);
            border-radius: 0.25rem;
            padding: 1.5rem;
            background-color: white;
            transition: all 0.2s;
          }
          .image-uploader-wrapper .ui.segment:hover {
            border-color: #2185d0;
            background-color: #f8f9fa;
          }
          .image-uploader-wrapper input[type="file"] {
            display: none;
          }
        `}</style>
      </div>
    );
  } else {
    return (
      <div className="image-uploader-wrapper">
        <ImageUploaderFrame
          {...props}
          uploader={async (domFile: File) => {
            const response = await FileService.upload(domFile);
            return response.file;
          }}
        />
        <style>{`
          .image-uploader-wrapper .ui.button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            font-weight: 400;
            padding: 0.6rem 1.2rem;
            transition: all 0.2s;
            cursor: pointer;
            border: 1px solid rgba(34, 36, 38, 0.15);
            background-color: #e0e1e2;
            color: rgba(0, 0, 0, 0.6);
            box-shadow: 0 0 0 0 rgba(34, 36, 38, 0.15) inset;
          }
          .image-uploader-wrapper .ui.button:hover {
            background-color: #cacbcd;
            color: rgba(0, 0, 0, 0.8);
          }
          .image-uploader-wrapper .ui.button.primary {
            background-color: #2185d0;
            color: white;
            border-color: #2185d0;
            text-shadow: none;
          }
          .image-uploader-wrapper .ui.button.primary:hover {
            background-color: #1678c2;
            border-color: #1678c2;
          }
          .image-uploader-wrapper .ui.button.negative {
            background-color: #db2828;
            color: white;
            border-color: #db2828;
            text-shadow: none;
          }
          .image-uploader-wrapper .ui.button.negative:hover {
            background-color: #d01919;
            border-color: #d01919;
          }
          .image-uploader-wrapper .ui.buttons {
            display: inline-flex;
            gap: 0.25rem;
          }
          .image-uploader-wrapper .ui.segment {
            border: 2px dashed rgba(34, 36, 38, 0.15);
            border-radius: 0.25rem;
            padding: 1.5rem;
            background-color: white;
            transition: all 0.2s;
          }
          .image-uploader-wrapper .ui.segment:hover {
            border-color: #2185d0;
            background-color: #f8f9fa;
          }
          .image-uploader-wrapper input[type="file"] {
            display: none;
          }
        `}</style>
      </div>
    );
  }
}
