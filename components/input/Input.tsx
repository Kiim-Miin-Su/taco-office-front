export type InputType = "text" | "email";
export type TextInfoType = "email" | "name";

type InputProps = {
  key: string;
  inputType: InputType;
  infoType: TextInfoType;
  placeHolder: string;
  value: string;
  onChange: (name: TextInfoType, value: string) => void;
};

export default function Input({ key, inputType, infoType, placeHolder, value, onChange }: InputProps) {

  return (
    <>
      <input
        key={key}
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
