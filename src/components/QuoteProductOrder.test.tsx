// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import QuoteProductOrder from "./QuoteProductOrder";
afterEach(cleanup);
it("waits for the complete multi-digit position and commits once on Enter plus blur",()=>{
  const move=vi.fn();render(<QuoteProductOrder index={2} count={15} onMoveTo={move}/>);
  const input=screen.getByRole("textbox",{name:"Posizione prodotto 3"});
  fireEvent.change(input,{target:{value:"1"}});expect(move).not.toHaveBeenCalled();
  fireEvent.change(input,{target:{value:"12"}});expect(move).not.toHaveBeenCalled();
  fireEvent.keyDown(input,{key:"Enter"});fireEvent.blur(input);
  expect(move).toHaveBeenCalledExactlyOnceWith(11);
});
it.each(["","0","6","-1","1.5","1,5","abc"])("rejects position %s without changing order",value=>{
  const move=vi.fn();render(<QuoteProductOrder index={2} count={5} onMoveTo={move}/>);
  const input=screen.getByRole("textbox",{name:"Posizione prodotto 3"});
  fireEvent.change(input,{target:{value}});fireEvent.blur(input);
  expect(move).not.toHaveBeenCalled();expect(screen.getByRole("alert").textContent).toContain("da 1 a 5");
  fireEvent.change(input,{target:{value:"1"}});fireEvent.blur(input);
  expect(move).toHaveBeenCalledExactlyOnceWith(0);
});
it("cancels pending typing with Escape and leaves arrow actions available",()=>{
  const move=vi.fn();render(<QuoteProductOrder index={2} count={5} onMoveTo={move}/>);
  const input=screen.getByRole("textbox",{name:"Posizione prodotto 3"}) as HTMLInputElement;
  fireEvent.change(input,{target:{value:"1"}});fireEvent.keyDown(input,{key:"Escape"});fireEvent.blur(input);
  expect(input.value).toBe("3");expect(move).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Sposta giù prodotto 3"}));
  expect(move).toHaveBeenCalledExactlyOnceWith(3);
});
it("does not move while locked and disables the applicable endpoints",()=>{
  const move=vi.fn();const {rerender}=render(<QuoteProductOrder index={0} count={1} disabled onMoveTo={move}/>);
  expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
  for(const button of screen.getAllByRole("button"))expect((button as HTMLButtonElement).disabled).toBe(true);
  rerender(<QuoteProductOrder index={0} count={1} onMoveTo={move}/>);
  expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
  for(const button of screen.getAllByRole("button"))expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(move).not.toHaveBeenCalled();
});
