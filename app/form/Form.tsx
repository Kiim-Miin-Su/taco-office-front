"use client";

import { formReducer, initialForm } from "@/app/form/formAction";
import { useReducer } from "react";
import TextInput from "../../components/input/TextInput";
import Button from "../../components/button/Button";
import { TextInfoType } from "./formAction";

export default function Form() {
  const [form, formDispatch] = useReducer(formReducer, initialForm); // initialForm으로 자동 타입 추론

  const handleFormText = (textInfo: TextInfoType, value: string) => {
    if (textInfo === "email") {
      formDispatch({
        // form은 알아서 넣어줌 action {type: string; value: string}만 채우면 됨
        type: "CHANGE_EMAIL",
        value,
      });
    }
    if (textInfo === "name") {
      formDispatch({
        type: "CHANGE_NAME",
        value,
      });
    }
    if (textInfo === "tel") {
      formDispatch({
        type: "CHANGE_TEL",
        value,
      });
    }
  }; // end of handleFormText();

  // const handleFormText = (value: )

  return (
    <div className="form p-2">
      <form>
        <div className="input p-2">
          {/* FIXME: check regex for e-mail, tel */}
          <TextInput handler={handleFormText} textInfo="email" textType="email" placeHolder="kms545487@gmail.com" />
          <TextInput handler={handleFormText} textInfo="name" textType="text" placeHolder="김사과" />
          <TextInput handler={handleFormText} textInfo="tel" textType="tel" placeHolder="010-0000-0000" />
        </div>
        <div className="submit hover bg-black-400 p-2">
          {/* TODO: fetch backend */}
          <Button label="submit" key={"submit"} onClick={() => console.log(form.email, form.name, form.tel)} />
        </div>
      </form>
    </div>
  );
}
