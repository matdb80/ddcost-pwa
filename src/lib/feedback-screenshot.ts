import {toCanvas} from "html-to-image";

/**
 * Capture the currently visible DDCost application (excluding the floating
 * feedback launcher). The report Dialog uses a Radix portal outside #root, so
 * it is not part of the screenshot. Browser DOM rendering cannot capture
 * browser chrome, system dialogs or cross-origin iframes.
 */
export async function captureFeedbackScreenshot(root:HTMLElement):Promise<File> {
  const bounds=root.getBoundingClientRect();
  if(bounds.width<1 || bounds.height<1)
    throw new Error("Pagina non visibile");
  const scale=Math.min(1,1440/bounds.width,1200/bounds.height);
  const canvas=await toCanvas(root,{
    pixelRatio:1,
    canvasWidth:Math.max(1,Math.round(bounds.width*scale)),
    canvasHeight:Math.max(1,Math.round(bounds.height*scale)),
    backgroundColor:"#f8fafc",
    skipFonts:true,
    cacheBust:false,
    filter(node){
      return !(node instanceof HTMLElement && node.hasAttribute("data-feedback-trigger"));
    },
  });
  const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(value=>value?resolve(value):reject(new Error("Screenshot non generato")),"image/png");
  });
  return new File([blob],"ddcost-schermata-automatica.png",{type:"image/png"});
}
