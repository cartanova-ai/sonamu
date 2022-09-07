import React, { useState } from "react";
import { BrandService } from "./services/brand/brand.service";
import { BrandSaveParams } from "./services/brand/brand.types";
import { defaultCatch } from "./services/sonamu.shared";

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
      <button onClick={() => setEnable(!enable)}>Toggle Call</button>
      {isLoading && <>Loading</>}
      <input
        type="text"
        value={form.name}
        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value,
          })
        }
        onKeyUp={(e) => e.key === "Enter" && submitForm()}
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
              <button onClick={() => delBrand(row.id)}>X</button>
              <button onClick={() => attachBrand(row.id)}>O</button>
            </div>
          ))}
      </div>
    </>
  );
}
