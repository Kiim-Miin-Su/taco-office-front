import { TextInfoType, TextInputType } from "@/app/form/formAction";

type InputProps = {
  textType: TextInputType;
  textInfo: TextInfoType;
  placeHolder: string;
  handler: (textInfo: TextInfoType, value: string) => void;
};

export default function TextInput({ textType, textInfo, placeHolder, handler }: InputProps) {
  return (
    <>
      <div>
        <input
          type={textType}
          onChange={(e) => handler(textInfo, e.target.value)}
          placeholder={placeHolder}
          className="border m-1"
          key={`${textInfo}-${placeHolder}`}
        />
      </div>
    </>
  );
}
