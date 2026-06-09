export type InputType = "text" | "email";
export type TextInfoType = "email" | "name";

type InputProps = {
  inputType: InputType;
  infoType: TextInfoType;
  placeHolder: string;
  value: string;
  onChange: (name: TextInfoType, value: string) => void;
};

export default function Input({ inputType, infoType, placeHolder, value, onChange }: InputProps) {

  return (
    <>
      <input
        value={value}
        name={infoType}
        type={inputType}
        className="p-1 w-[250px] h-[35px] border-gray-400"
        placeholder={placeHolder}
        onChange={(e) => onChange(infoType, e.target.value)}
      />
    </>
  );
}
