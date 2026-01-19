import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import type { SonamuFile } from "@/contexts";
import { useSonamuContext } from "@/contexts";
import BoldIcon from "~icons/lucide/bold";
import ItalicIcon from "~icons/lucide/italic";
import UnderlineIcon from "~icons/lucide/underline";
import UploadIcon from "~icons/lucide/upload";

export const Route = createFileRoute("/form")({
  component: FormPage,
});

function FormPage() {
  const { uploader } = useSonamuContext();
  const [comboboxValue, setComboboxValue] = useState<string | undefined>("option1");
  const [otpValue, setOtpValue] = useState("");
  const [togglePressed, setTogglePressed] = useState(false);
  const [toggleGroupValue, setToggleGroupValue] = useState<string>("center");

  // FileInput states - Single modes
  const [singleEagerImageValue, setSingleEagerImageValue] = useState<SonamuFile | File | null>(
    null,
  );
  const [singleLazyImageValue, setSingleLazyImageValue] = useState<SonamuFile | File | null>(null);
  const [singleEagerFileValue, setSingleEagerFileValue] = useState<SonamuFile | File | null>(null);
  const [singleLazyFileValue, setSingleLazyFileValue] = useState<SonamuFile | File | null>(null);

  // FileInput states - Multiple modes
  const [multipleEagerImageValue, setMultipleEagerImageValue] = useState<(SonamuFile | File)[]>([]);
  const [multipleLazyImageValue, setMultipleLazyImageValue] = useState<(SonamuFile | File)[]>([]);
  const [multipleEagerFileValue, setMultipleEagerFileValue] = useState<(SonamuFile | File)[]>([]);
  const [multipleLazyFileValue, setMultipleLazyFileValue] = useState<(SonamuFile | File)[]>([]);

  const comboboxOptions: ComboboxOption[] = [
    { value: "option1", label: "옵션 1" },
    { value: "option2", label: "옵션 2" },
    { value: "option3", label: "옵션 3" },
  ];

  // Lazy 모드 업로드 핸들러
  const handleSingleLazyImageUpload = async () => {
    if (singleLazyImageValue instanceof File) {
      const uploaded = await uploader([singleLazyImageValue]);
      setSingleLazyImageValue(uploaded[0]);
    }
  };

  const handleSingleLazyFileUpload = async () => {
    if (singleLazyFileValue instanceof File) {
      const uploaded = await uploader([singleLazyFileValue]);
      setSingleLazyFileValue(uploaded[0]);
    }
  };

  const handleMultipleLazyImageUpload = async () => {
    const filesToUpload = multipleLazyImageValue.filter((f) => f instanceof File) as File[];
    if (filesToUpload.length > 0) {
      const uploaded = await uploader(filesToUpload);
      setMultipleLazyImageValue((prev) =>
        prev.map((item) => {
          if (item instanceof File) {
            const found = uploaded.find((u) => u.name === item.name);
            return found || item;
          }
          return item;
        }),
      );
    }
  };

  const handleMultipleLazyFileUpload = async () => {
    const filesToUpload = multipleLazyFileValue.filter((f) => f instanceof File) as File[];
    if (filesToUpload.length > 0) {
      const uploaded = await uploader(filesToUpload);
      setMultipleLazyFileValue((prev) =>
        prev.map((item) => {
          if (item instanceof File) {
            const found = uploaded.find((u) => u.name === item.name);
            return found || item;
          }
          return item;
        }),
      );
    }
  };

  return (
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
            <Input placeholder="기본 입력" />
            <Input type="email" placeholder="이메일 입력" />
            <Input type="password" placeholder="비밀번호 입력" />
            <Input disabled placeholder="비활성화된 입력" />
          </div>
        </div>
      </section>

      {/* Checkbox */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Checkbox</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="space-y-3">
            <Checkbox label="체크박스 1" />
            <Checkbox label="체크박스 2" defaultChecked />
            <Checkbox label="비활성화된 체크박스" disabled />
          </div>
        </div>
      </section>

      {/* Radio Group */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Radio Group</h2>
        <div className="border rounded-lg p-6 bg-card">
          <RadioGroup defaultValue="option-1">
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
            <Switch id="airplane-mode" />
            <Label htmlFor="airplane-mode">비행기 모드</Label>
          </div>
        </div>
      </section>

      {/* Textarea */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Textarea</h2>
        <div className="border rounded-lg p-6 bg-card">
          <Textarea placeholder="여러 줄 입력..." className="max-w-md" />
        </div>
      </section>

      {/* Slider */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Slider</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Slider defaultValue={[50]} max={100} step={1} />
          </div>
        </div>
      </section>

      {/* Label */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Label</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" placeholder="your@email.com" />
          </div>
        </div>
      </section>

      {/* Combobox */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Combobox</h2>
        <div className="border rounded-lg p-6 bg-card">
          <div className="max-w-md">
            <Combobox
              options={comboboxOptions}
              value={comboboxValue}
              onValueChange={setComboboxValue}
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
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Single + Eager + Image</Label>
                  <FileInput
                    uploadMode="eager"
                    viewMode="image"
                    value={singleEagerImageValue}
                    onValueChange={setSingleEagerImageValue}
                    previewSize="md"
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Single + Lazy + Image</Label>
                  <FileInput
                    uploadMode="lazy"
                    viewMode="image"
                    value={singleLazyImageValue}
                    onValueChange={setSingleLazyImageValue}
                    previewSize="md"
                  />
                  <Button
                    size="xs"
                    onClick={handleSingleLazyImageUpload}
                    disabled={!singleLazyImageValue || !(singleLazyImageValue instanceof File)}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Single + Eager + File</Label>
                  <FileInput
                    uploadMode="eager"
                    viewMode="file"
                    value={singleEagerFileValue}
                    onValueChange={setSingleEagerFileValue}
                    previewSize="md"
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Single + Lazy + File</Label>
                  <FileInput
                    uploadMode="lazy"
                    viewMode="file"
                    value={singleLazyFileValue}
                    onValueChange={setSingleLazyFileValue}
                    previewSize="md"
                  />
                  <Button
                    size="xs"
                    onClick={handleSingleLazyFileUpload}
                    disabled={!singleLazyFileValue || !(singleLazyFileValue instanceof File)}
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
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Multiple + Eager + Image</Label>
                  <FileInput
                    multiple
                    uploadMode="eager"
                    viewMode="image"
                    value={multipleEagerImageValue}
                    onValueChange={setMultipleEagerImageValue}
                    previewSize="md"
                    maxFiles={3}
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Multiple + Lazy + Image</Label>
                  <FileInput
                    multiple
                    uploadMode="lazy"
                    viewMode="image"
                    value={multipleLazyImageValue}
                    onValueChange={setMultipleLazyImageValue}
                    previewSize="md"
                    maxFiles={3}
                  />
                  <Button
                    size="xs"
                    onClick={handleMultipleLazyImageUpload}
                    disabled={
                      multipleLazyImageValue.length === 0 ||
                      !multipleLazyImageValue.some((f) => f instanceof File)
                    }
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Multiple + Eager + File</Label>
                  <FileInput
                    multiple
                    uploadMode="eager"
                    viewMode="file"
                    value={multipleEagerFileValue}
                    onValueChange={setMultipleEagerFileValue}
                    previewSize="md"
                    maxFiles={3}
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="text-xs">Multiple + Lazy + File</Label>
                  <FileInput
                    multiple
                    uploadMode="lazy"
                    viewMode="file"
                    value={multipleLazyFileValue}
                    onValueChange={setMultipleLazyFileValue}
                    previewSize="md"
                    maxFiles={3}
                  />
                  <Button
                    size="xs"
                    onClick={handleMultipleLazyFileUpload}
                    disabled={
                      multipleLazyFileValue.length === 0 ||
                      !multipleLazyFileValue.some((f) => f instanceof File)
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
            <InputOTP maxLength={6} value={otpValue} onChange={setOtpValue}>
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
            <Toggle pressed={togglePressed} onPressedChange={setTogglePressed}>
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
          <ToggleGroup type="single" value={toggleGroupValue} onValueChange={setToggleGroupValue}>
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
  );
}
