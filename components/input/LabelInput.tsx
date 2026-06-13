import { InterestType, PreferTimeType, TextInfoType } from '../../app/form/formAction';
type InputProps = {
  inputType: InterestType | PreferTimeType;
  infoType: "label";
  value: string;
  onChange: (name: TextInfoType, value: string) => void;
};

export default function LabelInput({ inputType, infoType, placeHolder, value, onChange }: InputProps) {

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
