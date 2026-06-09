"use client";

import { formReducer, initialForm } from "@/app/form/formAction";
import { useReducer } from "react";
import Input, { TextInfoType } from "../../components/input/Input";

export default function Form() {
  const [form, formDispatch] = useReducer(formReducer, initialForm);

  const handleForm = (textInfoType: TextInfoType, value: string) => {
    if (textInfoType === "email") {
      formDispatch({
        type: "CHANGE_EMAIL",
        value,
      });
    }

    if (textInfoType === "name") {
      formDispatch({
        type: "CHANGE_NAME",
        value,
      });
    }
  };

  return (
    <div className="form p-2">
      <form>
        <div className="input p-2">
          <Input inputType="text" infoType="email" placeHolder="email" value={form.email} onChange={handleForm} />

          <Input inputType="text" infoType="name" placeHolder="name" value={form.name} onChange={handleForm} />
        </div>
      </form>
    </div>
  );
}
