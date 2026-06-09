"use client";

import { formReducer, initialForm } from "@/app/form/formAction";
import { useReducer } from "react";
import Input, { TextInfoType } from "../../components/input/Input";
import Button from "../../components/button/Button";

export default function Form() {
  const [form, formDispatch] = useReducer(formReducer, initialForm); // initialForm으로 자동 타입 추론

  const handleForm = (textInfoType: TextInfoType, value: string) => {
    if (textInfoType === "email") {
      formDispatch({
        // form은 알아서 넣어줌 action {type: string; value: string}만 채우면 됨
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
        <div className="submit hover bg-black-400">
          <Button label="submit" key={"submit"} onClick={(e) => console.log(e.type, form.email, form.name)}/>
        </div>
      </form>
    </div>
  );
}
