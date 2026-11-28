// @vitest-environment jsdom
import {useState} from "react";
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import LaborCostField from "./LaborCostField";
afterEach(cleanup);
it("updates the minute equivalent while typing comma/dot and clearing the hourly input",()=>{
  function Form(){const [value,setValue]=useState(24);return <LaborCostField id="rate" value={value} onChange={setValue}/>;}
  render(<Form/>);
  const input=screen.getByRole("textbox",{name:"Costo €/h"});
  expect(screen.getByText("(0,4000 €/min)")).toBeTruthy();
  fireEvent.focus(input);
  fireEvent.change(input,{target:{value:"21,28"}});
  expect(screen.getByText("(0,3547 €/min)")).toBeTruthy();
  fireEvent.change(input,{target:{value:"30.60"}});
  expect(screen.getByText("(0,5100 €/min)")).toBeTruthy();
  fireEvent.change(input,{target:{value:""}});
  expect(screen.getByText("(— €/min)")).toBeTruthy();
  fireEvent.blur(input);
  expect(screen.getByText("(0,0000 €/min)")).toBeTruthy();
});
it("does not round or rewrite a historical per-minute value merely from focus and blur",()=>{
  const changed=vi.fn();
  render(<LaborCostField id="rate" storedUnit="minute" value={0.285123456789} onChange={changed}/>);
  const input=screen.getByRole("textbox",{name:"Costo €/h"}) as HTMLInputElement;
  expect(input.value).toBe("17,107407");
  fireEvent.focus(input);fireEvent.blur(input);
  expect(changed).not.toHaveBeenCalled();
});
