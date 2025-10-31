import React, { useState } from "react";
import { defaultCatch } from "./services/sonamu.shared";
import { BrandService } from "src/services/brand/brand.service";
import { BrandSaveParams } from "src/services/brand/brand.types";
import { Button, Input } from "semantic-ui-react";

type BrandsListProps = {};
export default function BrandsList(props: BrandsListProps) {
  const [enable, setEnable] = useState<boolean>(true);
  const [form, setForm] = useState<BrandSaveParams>({
    name: "",
  });

  const { data, error, mutate } = BrandService.useBrands(
    "A",
    {
      num: 0,
      page: 1,
    },
    {
      conditional: () => enable,
    }
  );
  const isLoading = !error && !data && enable;
  const { rows } = data ?? {};

  const submitForm = () => {
    if (form.name === "") {
      alert("브랜드명을 입력해주세요.");
      return;
    }

    BrandService.save([form])
      .then(() => {
        mutate();
        setForm({
          ...form,
          name: "",
        });
      })
      .catch(defaultCatch);
  };

  const delBrand = (id: number) => {
    BrandService.del([id]).then(() => {
      mutate();
    });
  };

  const attachBrand = (id: number) => {
    BrandService.attach([id], "test1").then(() => {
      mutate();
    });
  };

  return (
    <>
      <Button onClick={() => setEnable(!enable)} content="Toggle Call" />
      {isLoading && <>Loading</>}
      <Input
        value={form.name}
        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value,
          })
        }
        onKeyUp={(e: KeyboardEvent) => e.key === "Enter" && submitForm()}
      />
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap" }}>
        {rows &&
          rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                padding: 3,
                margin: 3,
                backgroundColor: "#aee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {row.name}
              <Button icon="trash" onClick={() => delBrand(row.id)} />
              <Button icon="attach" onClick={() => attachBrand(row.id)} />
            </div>
          ))}
      </div>
    </>
  );
}
