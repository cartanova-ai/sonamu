import { createFileRoute } from "@tanstack/react-router";
import BoldIcon from "~icons/lucide/bold";
import ItalicIcon from "~icons/lucide/italic";
import UnderlineIcon from "~icons/lucide/underline";
import UploadIcon from "~icons/lucide/upload";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSonamuBaseContext } from "@/contexts";
import { useTypeForm } from "@/lib/form-helpers";

import { FormDebugPanel } from "../components/FormDebugPanel";
import { FormDemoSchema } from "../schemas/form-demo.schema";

export const Route = createFileRoute("/form")({
  component: FormPage,
});

function FormPage() {
  const { uploader } = useSonamuBaseContext();

  // useTypeForm으로 폼 상태 관리
  const { form, register } = useTypeForm(FormDemoSchema, {
    text: "",
    email: "",
    password: "",
    checkbox1: false,
    checkbox2: true,
    radioGroup: "option-1",
    airplaneMode: false,
    textarea: "",
    slider: 50,
    combobox: "option1",
    singleEagerImage: null,
    singleLazyImage: null,
    singleEagerFile: null,
    singleLazyFile: null,
    multipleEagerImage: [],
    multipleLazyImage: [],
    multipleEagerFile: [],
    multipleLazyFile: [],
    otp: "",
    toggleBold: false,
    toggleGroup: "center",
  });

  const comboboxOptions: ComboboxOption[] = [
    { value: "option1", label: "옵션 1" },
    { value: "option2", label: "옵션 2" },
    { value: "option3", label: "옵션 3" },
  ];

  // Lazy 모드 업로드 핸들러
  const handleSingleLazyImageUpload = async () => {
    if (form.singleLazyImage instanceof File) {
      const uploaded = await uploader([form.singleLazyImage]);
      register("singleLazyImage").onValueChange(uploaded[0]);
    }
  };

  const handleSingleLazyFileUpload = async () => {
    if (form.singleLazyFile instanceof File) {
      const uploaded = await uploader([form.singleLazyFile]);
      register("singleLazyFile").onValueChange(uploaded[0]);
    }
  };

  const handleMultipleLazyImageUpload = async () => {
    const filesToUpload = form.multipleLazyImage.filter((f) => f instanceof File);
    if (filesToUpload.length > 0) {
      const uploaded = await uploader(filesToUpload);
      const updated = form.multipleLazyImage.map((item) => {
        if (item instanceof File) {
          const found = uploaded.find((u) => u.name === item.name);
          return found || item;
        }
        return item;
      });
      register("multipleLazyImage").onValueChange(updated);
    }
  };

  const handleMultipleLazyFileUpload = async () => {
    const filesToUpload = form.multipleLazyFile.filter((f) => f instanceof File);
    if (filesToUpload.length > 0) {
      const uploaded = await uploader(filesToUpload);
      const updated = form.multipleLazyFile.map((item) => {
        if (item instanceof File) {
          const found = uploaded.find((u) => u.name === item.name);
          return found || item;
        }
        return item;
      });
      register("multipleLazyFile").onValueChange(updated);
    }
  };

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">📝 Form Components</h1>
          <p className="mt-2 text-muted-foreground">17개의 폼 입력 및 인터랙션 컴포넌트</p>
        </div>

        {/* Button */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Button</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
        </section>

        {/* Input */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Input</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-y-4 max-w-md">
              <Input {...register("text")} placeholder="기본 입력" />
              <Input {...register("email")} type="email" placeholder="이메일 입력" />
              <Input {...register("password")} type="password" placeholder="비밀번호 입력" />
              <Input disabled placeholder="비활성화된 입력" />
            </div>
          </div>
        </section>

        {/* Checkbox */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Checkbox</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-y-3">
              <Checkbox {...register("checkbox1")} label="체크박스 1" />
              <Checkbox {...register("checkbox2")} label="체크박스 2" />
              <Checkbox label="비활성화된 체크박스" disabled />
            </div>
          </div>
        </section>

        {/* Radio Group */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Radio Group</h2>
          <div className="border rounded-lg p-6 bg-card">
            <RadioGroup {...register("radioGroup")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option-1" id="option-1" />
                <Label htmlFor="option-1">옵션 1</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option-2" id="option-2" />
                <Label htmlFor="option-2">옵션 2</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="option-3" id="option-3" />
                <Label htmlFor="option-3">옵션 3</Label>
              </div>
            </RadioGroup>
          </div>
        </section>

        {/* Switch */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Switch</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="flex items-center space-x-2">
              <Switch {...register("airplaneMode")} id="airplane-mode" />
              <Label htmlFor="airplane-mode">비행기 모드</Label>
            </div>
          </div>
        </section>

        {/* Textarea */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Textarea</h2>
          <div className="border rounded-lg p-6 bg-card">
            <Textarea
              {...register("textarea")}
              placeholder="여러 줄 입력..."
              className="max-w-md"
            />
          </div>
        </section>

        {/* Slider */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Slider</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="max-w-md">
              <Slider {...register("slider")} max={100} step={1} />
            </div>
          </div>
        </section>

        {/* Label */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Label</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="email-demo">이메일</Label>
              <Input id="email-demo" type="email" placeholder="your@email.com" />
            </div>
          </div>
        </section>

        {/* Combobox */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Combobox</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="max-w-md">
              <Combobox
                {...register("combobox")}
                options={comboboxOptions}
                placeholder="옵션을 선택하세요"
                clearable
              />
            </div>
          </div>
        </section>

        {/* File Input */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">File Input</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="space-y-6">
              {/* Single Modes */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Single Mode</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Single + Eager + Image</Label>
                    <FileInput
                      {...register("singleEagerImage")}
                      uploadMode="eager"
                      viewMode="image"
                      previewSize="md"
                    />
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Single + Lazy + Image</Label>
                    <FileInput
                      {...register("singleLazyImage")}
                      uploadMode="lazy"
                      viewMode="image"
                      previewSize="md"
                    />
                    <Button
                      size="xs"
                      onClick={handleSingleLazyImageUpload}
                      disabled={!form.singleLazyImage || !(form.singleLazyImage instanceof File)}
                      icon={<UploadIcon />}
                    >
                      Upload
                    </Button>
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Single + Eager + File</Label>
                    <FileInput
                      {...register("singleEagerFile")}
                      uploadMode="eager"
                      viewMode="file"
                      previewSize="md"
                    />
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Single + Lazy + File</Label>
                    <FileInput
                      {...register("singleLazyFile")}
                      uploadMode="lazy"
                      viewMode="file"
                      previewSize="md"
                    />
                    <Button
                      size="xs"
                      onClick={handleSingleLazyFileUpload}
                      disabled={!form.singleLazyFile || !(form.singleLazyFile instanceof File)}
                      icon={<UploadIcon />}
                    >
                      Upload
                    </Button>
                  </div>
                </div>
              </div>

              {/* Multiple Modes */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Multiple Mode</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Multiple + Eager + Image</Label>
                    <FileInput
                      {...register("multipleEagerImage")}
                      multiple
                      uploadMode="eager"
                      viewMode="image"
                      previewSize="md"
                      maxFiles={3}
                    />
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Multiple + Lazy + Image</Label>
                    <FileInput
                      {...register("multipleLazyImage")}
                      multiple
                      uploadMode="lazy"
                      viewMode="image"
                      previewSize="md"
                      maxFiles={3}
                    />
                    <Button
                      size="xs"
                      onClick={handleMultipleLazyImageUpload}
                      disabled={
                        form.multipleLazyImage.length === 0 ||
                        !form.multipleLazyImage.some((f) => f instanceof File)
                      }
                      icon={<UploadIcon />}
                    >
                      Upload
                    </Button>
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Multiple + Eager + File</Label>
                    <FileInput
                      {...register("multipleEagerFile")}
                      multiple
                      uploadMode="eager"
                      viewMode="file"
                      previewSize="md"
                      maxFiles={3}
                    />
                  </div>
                  <div className="flex flex-col space-y-2 w-[200px]">
                    <Label className="text-xs">Multiple + Lazy + File</Label>
                    <FileInput
                      {...register("multipleLazyFile")}
                      multiple
                      uploadMode="lazy"
                      viewMode="file"
                      previewSize="md"
                      maxFiles={3}
                    />
                    <Button
                      size="xs"
                      onClick={handleMultipleLazyFileUpload}
                      disabled={
                        form.multipleLazyFile.length === 0 ||
                        !form.multipleLazyFile.some((f) => f instanceof File)
                      }
                      icon={<UploadIcon />}
                    >
                      Upload
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Input OTP */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Input OTP</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="max-w-md space-y-2">
              <Label htmlFor="otp">인증 코드 입력</Label>
              <InputOTP maxLength={6} value={form.otp} onChange={register("otp").onValueChange}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
        </section>

        {/* Toggle */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Toggle</h2>
          <div className="border rounded-lg p-6 bg-card">
            <div className="flex gap-2">
              <Toggle {...register("toggleBold")}>
                <BoldIcon />
              </Toggle>
              <Toggle variant="outline">
                <ItalicIcon />
              </Toggle>
            </div>
          </div>
        </section>

        {/* Toggle Group */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Toggle Group</h2>
          <div className="border rounded-lg p-6 bg-card">
            <ToggleGroup {...register("toggleGroup")} type="single">
              <ToggleGroupItem value="left">
                <BoldIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <ItalicIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <UnderlineIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </section>
      </div>

      {/* 디버그 패널 - 우측 하단에 고정 */}
      <FormDebugPanel
        formData={form}
        title="Form Values"
        sections={[
          { title: "Input", fields: ["text", "email", "password"] },
          { title: "Checkbox", fields: ["checkbox1", "checkbox2"] },
          { title: "Radio Group", fields: ["radioGroup"] },
          { title: "Switch", fields: ["airplaneMode"] },
          { title: "Textarea", fields: ["textarea"] },
          { title: "Slider", fields: ["slider"] },
          { title: "Combobox", fields: ["combobox"] },
          {
            title: "FileInput (Single)",
            fields: ["singleEagerImage", "singleLazyImage", "singleEagerFile", "singleLazyFile"],
          },
          {
            title: "FileInput (Multiple)",
            fields: [
              "multipleEagerImage",
              "multipleLazyImage",
              "multipleEagerFile",
              "multipleLazyFile",
            ],
          },
          { title: "Input OTP", fields: ["otp"] },
          { title: "Toggle", fields: ["toggleBold"] },
          { title: "Toggle Group", fields: ["toggleGroup"] },
        ]}
      />
    </>
  );
}
