import { FaClipboardCheck } from "react-icons/fa";
import { SteamAppTypeShortcut, StoreCategory, type AchievementsData } from "../../Interfaces";
import Logger from "../../logger";
import type { Mounts } from "../../System";
import { t } from "../../useTranslations";
import { Module, type ModuleCache, type ModuleConfig } from "../Module";
import type { AchievementsProvider } from "./AchievementsProvider";
import { afterPatch, beforePatch, callOriginal, DialogControlsSection, Field, findModuleExport, replacePatch, Toggle, type Patch } from "@decky/ui";
import type { AllAchievements, AppData, GlobalAchievements, Hook, SteamAppDetails, SteamAppOverview } from "../../SteamTypes";
import { grayScaleIcon, stateTransaction } from "../../util";
import { useMetaDeckState } from "../../MetaDeckState";
import { useState } from "react";
import React from "react";
import { RetroAchievementsAchievementsProvider, type RetroAchievementsAchievementsProviderCache, type RetroAchievementsAchievementsProviderConfig } from "./providers/RetroAchievementsAchievementsProvider";
import { RPCS3AchievementsProvider, type RPCS3AchievementsProviderCache, type RPCS3AchievementsProviderConfig } from "./providers/RPCS3AchievementsProvider";
import { XeniaAchievementsProvider, type XeniaAchievementsProviderCache, type XeniaAchievementsProviderConfig } from "./providers/XeniaAchievementsProvider";
import { GOGAchievementsProvider, type GOGAchievementsProviderCache, type GOGAchievementsProviderConfig } from "./providers/GOGAchievementsProvider";
import { ELibraryAssetType } from "@decky/ui/dist/globals/steam-client/App";

const dlcRibbon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGoAAABrCAYAAACffRcyAAAACXBIWXMAAAsTAAALEwEAmpwYAAAi4UlEQVR4nO19eXQdd3X/ne3t0tMuy7tNUkJ+/fHjl6ZQ3BRCS/fTP9rTc3pOt1MoLSUtLcexE8eJHUizEssmNaFZIBRCoSmlmKQhJLFJAgnxHsckXmTLsSVL1i69ffbpvd9536fRaN4iWbIdW9dnrDfrm/f9zN0+986MDBdOBJxEnCScQjhFcIorSrThH/7wwY0fabjm9yOqHc8KFpgRGRRBBEW3wRAdEARh+sEqLAtaF7Sc5m3BhkrHrHYMCDim96/jOIHLuYRMh22TTYZAMByoy5tg4ihJCv5nW4XX8t07tv3n5i/JcGGEg0TfRyBFcUoIolT/5x+/5c+url+6RnSEmIagOLLkDqBp4XniIIoi+yG1DCKXWrdngyjMfL+5OgfaxrZtGGmQoSlrQFRSICs5EAuHYFhQ811nDv/3fd/f+HVNy6oXAig/SDGc6kQ51PDpj2740xvarvujqBNdrJk62KIAAgIl2vgj8UeIkgQWODV/UbXBmQsg/MeodEyuTZWWZeoliI3ncVSi4FgWLkHgCpnMm/0Hvn3/jjt22JaZw4X6fAMlFCdu7mKCJCfD8ebWv/34bTf9Wv1VH4sY4iITDZCFUAoIlESWyLTZD3LCuJtpln5g0AD5TYt3fbnllQZ6JkAEbVNu+3LLRfytdXIYHM2C8TAOlGaO7zr23Fcf/fHWl3B1GqcMTtkLARSBpIBr7uoSLasWr/3ohi/8stT+/qwsJVU8fwjhJgJqEIKkoM0GRwAN5wuOxXYsJ+WuWP9AsxOpAoZ3m6D5auCVA6sa0EkVQFVoO5zJ5ce/uu/fOp/Z/9QhcEGaKP7NiTB/4g0cmE+qb1vd8Zkbb/3i/48vv84MKw149Qh6SGTOE9AfOYbpIosmT0TfZDFTMClBwAStq8XkMI0NWFZpvpqUOwf+Oej4Ov6VRQnSRj71xJ6vbX324PfeAhecFBS1CafCfAHFQSKFoOguEY41NP/1r6694yORFe9TDSORQ7MWETDSQYAEw2Ig0YkbuJcuuoMYdWZ2etUGdqYDX2nfcoNfaR++zH+RDOq5/FP7vvXQDw/teNu2TQKImzzyTxpOxlwD5Q3BS+ZOkkONN31882dvbLjql1XbjIcEGWIFB0bRJocwJA2j4kRwmRxSECgB8jaChgBG7dmf3mxBmcl+tYBVTQTbyX1/9zc7n977nTcwBvSDhIYRDJzsufRR/sCBmTtZiTb+5W/c9qkPJX/htwRbbNAcQ1AwaIiKMiTxOjFkDMX5ERAwCSM+iQ4h0pk6ReNd3n9UEv8A8uDDu69gC1PWuztOfvbmWeV+dPHLgjcIYU6YN0CPilDAH6hQxoG/L4qTaum57XsffmDngR8cdhwEyQEOFJm7Ekh09LkCioNExytpkhyKNv7Vx2//xK80XvuHdUK4LY8/28REjnxQATVGQ80JC1NPodaoaabR1Uy3mamUPWZBBz0sQixnQiSKFsMwIB4KQZ+Qz35z50N37zzyw6No7iho8IJUwIncFwOJDjMXQAUms+FYY/Onbrz1M2sarvndOoi0G5YlaJKbwArFiy/oCp+JzES7+PYzjdbOF1QDR0TIqyBEYhDGiDaD/reQGZt49JUtd7568pVu1CQeOHhBIk1yk6oiUOd7WXFTRyChx3FBiiUXtX7ihnU3f6zxvTeCJTQZoiDYssgS2hCG3kSbMPYB501h0mQEUTyOz/RUGrTA/atQOEH7ej9z0xe0fxCw/vVZxYI2Fc2ejD45JkBiQht54LnPbzrQu++MDyTySV6QnOLkfi/MXrwgUWTHGId407JFf/uRWzbeGFv9QVMUkzoqEFFDIjIOFByEMXigsJuF5IoU6Ee8QkAFAVD2pGYIRNA2lYAK2qfcxUDLQ+wYiAJak6ypjT64Y8OtR88e7gUXHD5NCRyK0xSZrenzmjtGrhLjkGhc1vHZNbfe/kuJZdcZgpS0MOxWIgqYDrILmgmyQ4ktBhCYO6kUguMgRK3KzAFf5h8A73y1/f3LZ0M1zdYEyjj0FvomO5dKPf7jBzYhSD0wqUVTQnAoAxI7DsxcvCCRuWMg1bWsXvqpNWs/f0NkxS+agpQYEXSol2QQESxRcMlHC8fXkom4csPuCGoX/btcfFTQthlUKTubzjyx55EvvN79k25wQeJAIcnHQCKejJu7QJlpouINwQkkZu4a2q5a9rkP3nzPDfWr3j8kaHV5oyC0i2EYw8vJcJBxQGDEMAaDaP7IJ1m4jExgkzpVQ7w/uNxA1LK8lrxmrraptq/lOPlvHHrygRd+/swRmAqS19xVBIlEgtplGkioSfWNzauW3nTjhvs+EFv8Pke34qCgFikKqCaF3hLRdoBWDndCRyu51wUxEXTl6cjxIWzFkg5pHTIUjl2ad5cJIMsK7k2Uks3+KoprCHRdZ6E+LxfQX6KeaGLBij07/zbFn9E/pzh5PxcnE3+cotogRpBYxd8Vw9zQUgQECMNxy9Ge6trxyPde/dpr4AJU4u5gUpNKkV0lqVWjApPZROPS9r/49XWbV0Ra3osnHVcFm3EdDrjAMHCK5oMCCC93R/mEqhXYX76cBp0mPsgEBGakoOkFMC0dFARWwIFRMTdBTKG+roFtS8DIMiaWeIHQvIkXCU3lfFU1mYkmRTQbcu1RUFMpiKOpz2NkZ+P+WkTUf9K7Z8d3dj38Eri+iPskr7mrCSSSWnxUIEiRREvLpz68fv0H5I73xw05bqIm2MSCY8jNnJFNuoL+CU+esnYbmXD3CsdICBO+uro4hNEcxuPx0iDTgJPQdnywM7ksFAoFyOfzoKoW2zeMAYqhY1lgfByTyFBJc/j+XGg+SKvKyayCjHgYxL5xCLclkfzWQEOTjuUac3Dw3IEtL977n4xxOE+QSIQa1k9jHEKxZPNNH9t886/GrvpN2RGbDFQnE0lWypVEBEmy3B9EIbhjuQQkBns4yDIDpr4+AcmGOohGowhWeIq54kIDTJOqqwywdCoDw8OjkE6n8XgCWtiwa/bAKmkr7U+gi8WqcLXQfy7yLMPQIBmOoC3Di0rBUjoq/1B29PDaH3z2i9ns8CC45o4mDlRNPikIiErrpjEOcqy+6e8+ets//EHs2t8bkaAlLMkChdo2kqkyJrKyYbOcyULtMijaU/WiBtVBY2MSmpoaIJ6Ilq521ydNDSo4aDQv43FwM7athscisAYGBlC7dKaF3C9x80qfud8is0qfyw14ueUzybOkggZ2YxQ1SQcRybszmbM773h6/dfzhfERcAHi5QpOC3HGYUYiVFg+jXEIxRubP40g/Ubkqt+2FLk1g04zhAEDS2jR1EV1SvBELFO4pQoa3GgkhOA0QVtbG9MkuuJJC2gdCQUQ3GT5s3sGnOgUtQXLIpEISEjmTkxMwJkzZ6C/fwD3ldmFwI5bDCr4YJYzZTMBaxqJ609qRcbgIgKmur/r1W9v3XXf0+hPOUA0ES1EmsRBmsI41CpBUR/XJDJ1LE/CqT7RvLzjb9asX/8H8fd9TFeUlkFRFxqlCFi6gScrMJMXwcEUMCLLCQgEnkuzEoO2JW3Q0tKM2tTABpMCBN3Q2BfxwfWaPr8ZFPBzKBRm86qqst+YSMRRQxMQi0chly24OVrR9PFAhB9/LiK/oOX8r4kXaD5kqy+++cyjD7+05UcegpWD5NWkWYFE4gcqkHFoaL962Sc/uPauNeHl1+cUoTkr2kIdEu8mgoRGDMNuiRGtEl1ZeMQchqZ1oQhc3bIYmpa3oh8KMc2xLJP5KvIvIlY1bYt3AQmsSjDVpxQHwjKnDJbjuCG8jOaVwDJ0NzokEMnMcXC8JpHvCwED75dyJrAcUCEMwZ9/+9nHn/jJ9l14XtwfcZDoyjpvkEi8QHGQaFkJpLZF16z85JrPPfDB0OJr445cn0eQ9Aj6ARyEGEY4eXnS8WOtiQFSH4lCR8ciaFzaysBj9R32z/0LONA0CWyFUzJ9ZMK4j9E0Df+KTKO4uJomFkF1p8aGBGqvBZlMls2LWDaxWTAjThmXckBVM48FUYcIVprpynUY8y9i2OawiKBJE82nB3Z959GdW54NAKkswTob4UD5NYkYh/r6ttVLPvEr/3TvsmjLNTExFMdrWaD2LQkHQbbdvYgB5z+MPoYU9EnNTWjuWpgmgSdY8PqfyREBltCmMA/p7xvAv2lm2igaZAMJlSM3SSZgZbAolM/kWELMTei0r6qgVeXW1eMQDVkqa11rQA+cN9FsY4ATUmRr97kDL2z70V3frmDuynJ3MxUCRoSp3B2jhdAnLfrEh/5x0/Vi+y84TihGvQwaDaopQMQE5oMoiKDGDG/CGovFoLW5BRrqkyxJ9V9G/iuYNJGis5HhMRYgUCRXX18PjU1JN2mVKufkdLxkMolA2ZhXpdAMGm7iC27iWW3fakKpQIMlgR4RIIO/h+rRCUuwDw8f333/85ufsEx93kEi4SDxHCmBU7KudfWSz3x43Z03hDquSzhKPRGr3CkrCAwls8zcUZRVJFVpnoBqaGhgoTgDw7IDB8Q7Tz6FhMCiGIAGhnwO/75qPJ5Z7Puj76TIkhJq8pcO67uAivtWWsfnbUw3ZPS3kYIFE5IFUSVinz57Yu+d/7PuIV3LjkGwuZtTkEhk8AQOUiTeGF901fK//79/t/mj4qJrRsCs0ySLdasquuDmJPgDTAqwRZgESCiy4Rg+UygeRlOmF1QWOHhZaBJ/zjSpcsThuUGGZTlFoKYOWlCZw8FIkwIJAryjox2GhoaAyiv8mLWW8IOE5WLUYo3nksPCX1teto+nuvfctmv9NrWQ4nlSucrsnAqNMDN3UiTR2Lbiuvf+4//7+84PSx3/JyuLGDhgFTmMPwrNj4JXumS4QQM17pNDkoViosmiMJmZrPp4gh2YfAaZRf6DvT/eK6RJHEj6zLk/b5hdbl+WEOP3msXwPNlQD0nM1dBnuGE+TALrP4dyrVx+KYSQYMVkPiKE7CPDJ/fe9tzabYXChD+Z9edJcy4EFKY/cqJ1ybUrP3nNX9z/a9Cx1JTl+IBkkIqxwp7CKHCBMQ1mMUqjQRCLVBENLtFBZPYY44CDxk1a0EB4e9toO07EUjJLEydZ/dxdkNAxJNaj7mpRa2uLGzkKYlUfVIuPItI1FQH79NCpA5teug1BYprEfRJnHOYsuisnNBLRxo5rFv/5L/7VP18vtS8eV5z4iGBCEq2hiF8dL9iAZX/QBbc5kgCjQSCQyD/wjlaK0iiQ4GQqDZ5fI8oJ1ySeB9H+5Kf8nbIk/sGl7Wgf94LRMLFunFWnbTmpQ3eZOXv6wO3Pr3uwkBsfhqncHQ8cyFHOG0gk4srVa5b96fWf3nit3PYe/B0R8kFhCm8xH5KRoc4rFO3ZrKZEmiU7bpBAfygio5yFTFwc6zFRhXIYg5GvBkVIlAdRPYmaK3EyNZNRPgCT9SK6vYaAD9M+WM7QtTyGvhI7Jk0sMKCgBAMY0Q2+2WdaTuvDGOHZFB3i95BvE3BZNB4DzXIZE8p7Kk0pvBrpmFEMvamFTackGc+b8rgEjsJ+7fhrtzz7uQfUfIqDlLrQIJHIf/y+P7lpldy+JuYoMQqmVTJv6EBtxw3B/W7XHxyQsGiwSJB6OTYvUUrr+TakMa7Jo3lzikbRNpNsOF0Tdsk08hoTN4tMY8Sp3ydjTjVJHU03nf5gotmQ2PekzCz61zhYmoE+z4K6ZNL68ZGd/7X1p198Ci+gcZgMHC44SCTy9fKy3xEcKULfRJpjk68gOsiGio0i3s8i4+NCpe05ONwHkdAgM79kT4bsNFG11qarwuGZgsg+Tyas7tVN89FohO1D9SmaJ1NrWGbpHOg7whhKkxmmc1CKXGI1bo8aQSNIHlt43AKOQYscs19487knt/70/h1FxsFPsJJPumAgkZBxSJKRKCA6FN2QeYvhaVBPg1i8T4mkUr8Cv8q9y/hf5uipPazoz5jWENdHHbIODa7FzCEHlvs1WkbraJ5qWK7/s9gUQYpKQQaEAOOmkZtEmY6PWsWWCdWjvhHZZAx9CE3nUMSGRiHkHHpn/9MPvb71mWLRj5fQvdHdBQWJjUdOsgWVQBLc8jkFDlT4I7NH7cdeqRbSBoHKE1JeZs9m8kj1ZJipIy3kQQMBwllz2ocTqwQqMeRjoxOsBM/Bdr8nOGSvNfxmFxJejDFRgREjDx1OBI5O9Lx+977O75qGOi8s+GxFdnMhgd1ERpGcRX6FIiiFGvhxUDQLyrVRkfCgwJsP+X0Y9zE04N3d3cyUtbd3wJIlS1iSLBZpKM4Fck2U5QiMT2TgxIkTTHtWr16JmrWYJbi0vatlU7+XltO5eJlzr/hNYRP6KBt/fJMShXeGe976/I83/2smPTgEwb3gFwUkEplMhmAW6RKhODHiGc2BFWzb/QNQakSBySSUfIcbJrtXPu+DIG1Kp7MsQqNBXYIMeyIRZqaOuowINFl2/d3ExDh0nTiDf1OsvDExkWZJNdFFNpqsEsNeBIr7KXe5NKWIWH4EFMhaBSeVGntz0yubOzPpASqflwNpzhmHWkXWcQAkzubgj7ZwokAijNXaMPqDXKS4zilfDuCsgne7Ul8b8082M3NEnra3tzNQSEN6enoxnDZg5cpIaWA5Z5jL5aCrqwsKql0MHBIMIIoKXZ7RLmlN8bwcXEa0RohrFAUpXm3j4p3X0J2dTvW9fveLt2/PZ0YoBPcms/POONQqxGSVmsYEcsbFH0fJLUtwA07PW7aQHDd3IS2xqc+N8qpi8wmx53TFK5gXkcYhVnD16vcw6qmnpwedvgCn3+nHMwgXE1adlUay2SycO3cOMmkNczH0IbEIEq5NyDo0QzQWLvkw1huB6o8VYzulpvo7mjqWUmeSaxrJgRHXbbCbmfOUaiAFRo8IyNO4GyYkwhFnd+boK/c+ffN201TnvHw+l3Let93w3IbauciskdZw00OaQ4NPWsAZB6zjoAatZPPkr0Q0PX19fewqJxqKth0cHGTHSyQS5DiRbO2ARYsWsXVuOR68jZf2WG70THOiZRUto3Ogxpd4vA6DDw0ieA6DdgEaMZdXMCnXSdvwAknXh52enhN77vvR+i8jSJQn+WkhHt3NqK1rvkScDa3ChZsQMjMEDtWDeETGozjmr4qBBq3TDZfpXrx4MQOMh+5cS7mvI1NJQtu1trYyEEuRIAJGx8KLwB5MDfZ0NC1eRcvoHKiuxXsoKHalo6FhxQgWzxcvmjRymAbm2en+04c3Pr+209DzHCRvCD6r3rv5FGb0ytVi/BIUfnvbsahKm83m2SDzK57nUd7PBTXHtlm1ahWsWLGi1PTCj8VJ3qVLl8ISBIoSVxV9GiN70cxSAISfrZH0cM+ixvaV1IwZDkVhaHCEVXlpX9I8FlzgOGNuxG7mHgjp0OLIzshQ79GNz6+7V9dy/nqSN0+6ZEAiqUpPVwLN1ahiTzhqBPmW/v5+ZvI4KJqK+ZLiRiQEAF35xBzYSB1Z6Pvfs3IVtDY1sxqWoWqsjhXBZLYNq8RLOxZPYdB58KBqqjUwdq53WevylTykJ2Cofcz1XUopCU846D/RT+k49s2W7JzLDJ+4Y9dtdyPB6mfBL1oyW4uURqGSVpX7TDLZ8SMxIMbGxkrdrLxwx9htcIHzao0bPtuoWStYjkRBB7U50+fly5fi9kbJLJZMqmNbo5mR3kWNHSs5Z0jTwMAQ0ya6SAg0uiAYk0/8JbUMKLI5MT50av3OW76QzgzxEPyiMw61SsVgopoJ5Mkup49Iu2hwqPeBzBols7SOMw+SqJTyKRKXkzNZ839LaxMOpnvdUA+gJAss3nJAKGkvAyk7fBZ90kruh0RbwotjgkWJ7Lwo0kMNtwTX3GoS8Za2fip19lDnqw/8Syp1bgAuIgs+W6k56gvKozg7zh05X9/b28sCADcgmEw6XWAni4qaVijmO8CO0dLSVMp7dF0tEr3uxWDZljmeG+trrW9bwUlaWp/FfItCffKPISRkMZliF0hBzbO/Md0y9o4ffW3ba52Pp12Q3jXmzitTgKrGNHs1iQuZJO643RDcQmceg9Onz+CVPg5XX7265GfcQp7A8i52HFAYQ+5SP5yfc4p8nuLWl4DZZ3MsN97XXte2QhRcgKjcTj7tyNvHwMhpjIilZht6xh8qECjItMsZzXgt/cbzW3/a+Q2sJ3l9kj9wuKRBIjnvPMrfq8cZcGIeCJizZ8+yEj1RPyW/UfQtZPoMU5uyr78TVdM1M6Nn+ttQk8iv8WruyMgYOzYUTEjLNnscTxLNYDbi8pTIc5g/mzj89LaX7v6W6bZ0+buF3jUgkUwDqhLdUk68hK33bj8KuYkGIvKVNI8oIPrL+TgSUi7eb+4N9RnRaxpGqjB2riHauJxAp3KHiezCAFowSpJTqQx7MkrSVti9WVmHbkUldkW2Dg4cerZz56YnffUk/10V7wqQSOQgc1YNLP+8v5rLexZoGXF0dKsMJcPUSka5UXNzcymklmSnVPX1RniCKBgZLT3QnGxbTppHfOHZc/1wtrefAcQKichc2PSwK/wX1k0Yi4sQz5r2qf63X97+s3uf9NST3tUgkZQ0KgiMWoXf61RiBBzHQ5hCqWxOPXd0ywyZQmp5ZuYQXGAIDHL+DDTLMEbSI4OoScvyeRVNXD/bl2pZ5LtoOyJcibhtCMcgj4HHaNiBVlW2uyd6dj+wv/OrmpodhfL3J72rQCKpOZgop1W844hTSRxg/31KfDmZw5GRERgdHWXziUSsBBIL5W3LwDxpMCJEl/ZofZBTC6VSPGmnS1fpRW2NQRaPp2AZPSRozpGBrt2d+x/6SmqyVHFZgERS1UdVEi8o3M94l7tATjatcPPImW8Chlh3x8m4Ps3U9ZyeHWqMNS3NigU3GsQxJYKVm0o6BgFLORsznRhlphtkZ+Cdky/f//r9j+TcUkVQ4PCuBYlEngkwQcK7hrwa5L0/iXobGJWk6VP8lxtsUA2reJO0IOioTcNtyUVLvffgUsuZYRbNKYbg1FhkFW/ZkemeYIxGuk4cevHen971qKEXiLurVE96V4JEIrNnRjlTW7/AW3r3YBgEKm9y9Jfq+bz3Tg8SDuLkPg5xflrezI/Uh5NLoPi8CfcY6N8wJ5Kw5pRVKJrDXM0U2U3d9Fwlev7srtybL3z5J3c9YhqqlwW/5OpJ5ytl86jz1bRaBbVIzxm50WSkYUnQenrI4mgYQ3NTYvcL020nlFT3RU0Ynzj98ld23f3Y5Q4SScV6VC2dPLNZVyrT26aWN3KkSYvLdRPlULsilsRumFMwFC/IFhiiDePnun92z8t3fEXX815zd1mCRDKtHlVuwPzLZiPe/VyQ8mN14frFQetLQqWKgpsnjcfoJjobzoy+s2frvs5HtEKGNIk/Su2y8kl+CSxz1NoTN9vtTNtUc3puLBGq66i2f9IJs7tIyJcmLQGO5nsOdB780mMT433U0uUF6bKI7srJlMLhTMEqt6ySmJapq2ZhAjWpg+9fSWPzBlZ2Ywp7qcjpgZMHtx94+Kvj472UJ3GQLpsQvJLMqY+qYT/Hciw9riQWVduHA6gib0r3Ph3N9x7a1vXE14cHT5517GnPF7qsQSIJ7JnwymyBKSNCSAolYAayJBSHrvHuww8f+MrXBge6eosgefOkS64RZT5kGtc3jaSlOy2KH0vLvMCI0++r9c57xbsN/6xKJsQsGahlJUePP0C9MMPuoxCasibsVY+9+fU3Hnt8eOTUWdvQeRjufTb4ZQ8SyXy+m6MmSRgS5AUb8o4Ji7MChJGJiLLmYROOOQNHHt7/r4+dG+zqKYLkfypK6QHucJmLWEsTy0wChpmG8lQ/oidlhpAKGsYkNoqFQLrbMV0YH+g8uP1h9Elk7soV/ub8MQGXqjDT52Uh/J+9EsRWTDOVMLN6lo0ASRY9tpQeDCzBoKRDeCIzce+xbXcND3VT4OA3d1ccSCRl28X8wteX267WPMsvMfROmk2PHsXyPGJn6rnRtT+/b/3wwAkyd94GSW+udEWBRBLI9ZXTMO/6ktRYti+nVYZtQDMyeBOCCcbA4OCGfZ+/JTXR7731paYHuF/uMu8+qtq2IrLrA0nEO5cdXrd74/oiSEGPU7tiQSKpGPXVEhjMlvcr7R+VQR0bGf/c63dsyGRGvC1d/tfzXNQbyS62lIIJkqCbvriUy7Oq1bMocqa3rmUi9ABGARK6xO6bpfuy9LAEJ2Aw+8j+L25Mu5rk5e64ubsi8qRqMm8vo+TA0t2MBEgzDnkBUaVKZRSLiEMRC8xcuvDNtx7dPDJypt/DOMzqAe6XuwSavpn4rWr0Uy5ksyc3OzZqkyFAPiRARjRByqQz9/98y629/Ue6TUPjNaUFkMqIPBUrb1RW+lQ1z6oUJeqKAPVpi5XPB1pCWFsyYbQwnnrw8NYNAwPHe21z2tvIan5fxZUks24Xq7Te+zlZoNcQOQgUmjys0I7Y6dSD++65eWj4VB9MbUTxh+ALIHlkVj6qWsDh/RwqYJEiIjFaKJ8az3Qe2nKLByT+fCFiwa/4ELySTPNRlULy2fioQvHOw5STzd3z9kO3Dg6eoLeR+d/8Mq9Pj7wcpCwzQVKtCynIR/mFbocZRJC2vtG5rq/37dMwHaQFc1eDyILtb/j3aA314BWfMz5p0vh27jy98Figp6pEBcaC07vPNcElW4kRPyL3Zp7Y++V1/ee6emABpFnLNPa8Vintg7WkkaQMzehlJPYgRrfpPxu2wdCyWQTp5r6+Yxwk/9vIFkLwGiWw9zxIyoE5FgVoyNE9s8g40BvYcNxzog6qUchtObBl7bm+Y2dg+nv9OEgLIXiNItYSFJQT2ofebgM6FvtImxIyK6GrhVxh24Ft6871Ha1k7hZAmoFMaW6ptSbllUbNvRVTVxA03YCUqGkPHX9kw9net0iT+AuBF/Kk8xTZS7bOpte8gAGHgpXZgmRAXs8ZXz7xtdtP97xxCoJBWvBJs5QZJ7x+QOmJYlmF7jbUjMdOf2PTydN7u3wtXQvc3RxI1d7zahIWQ4Alc+Px7n+/s+vk7qNF7m7WrzFdkGCRp9+3K4CXnDXEHIhmBBQ7DGaIbljS2HOFwlYIWvQYHK87oz15/KlNx0/sPWYZuhekoHcoLcgsparpCxtREGXqEjIgifphItMQVcKQwflBe6TwxFtPbjzZva/LV0+64vru5luqPr5ANBWsIekQtUxQ6X25qFn0tulIvpD7wqntG3pOHjwB0wOHeXs9z5UqVR9foIeRrytQKV0AoR61Cdnw8EQ6t2ng4Vt6uw+ehOmlCvJJCyDNsVStR8UcA1RRBtlG1gF5PceaUO8cfnxjb/cBDhJ/lJo3cFjwSXMs1R+xYxoQktDcYYARm8gY94w+eec7XXuOw3m+pH5BZiZitRvJNEeBdMiCiJ2xOnPfu/vYW6/8HKb6pCvm1peLKVXv5pDEGBi2Zn0p9b373jr84kEILp8vgDTPIkfMPI5yFLUmhH7Igjp60ye9u5WiO0uB4fhZ67vnnvvnNw89v982DW/D/oK5u4AiE0jZGECdqbMHQVkOuS0BRupsiBVS9nf7nrtr/8H/2QcLPumiipiVQ6zg59gaIDZQUCTIIGCJvGp/Y/wH9yFI+2GhVHHRhd4qCbGsjfUkAUbrJIjTI3HsvP2t1I+2HNz/wz0wvRd8gRa6CCI36BpoYcXtcSiYUAipzo7Urof27Pv+q77mSG/gsADSBRaZbiCzolGgpyE7RsH5D/Wl7a/t/++XA1jwBZAuosh5iV5hp4MRNpwd5mv/8urr392JIHl90kKb8SUgYp1TD3lBd36o797+ystPPocgUQjOw3DKlQgkfjvmAkgXSeQzsVP2Ybl/ywtPP/4MuICQBnmT2SvyntlLTaSlH/iQ853v3/cf4IJC4GRh4Z7ZS04EORTuMHWNslwya6Q9Giyw4Jec/C9/Pa2q3stM7AAAAABJRU5ErkJggg=="
;

const headerWidth = 460;
const headerHeight = 215;

// https://stackoverflow.com/a/21961894
/**
 * By Ken Fyrstenberg Nilsen
 *
 * drawImageProp(context, image [, x, y, width, height [,offsetX, offsetY]])
 *
 * If image and context are only arguments rectangle will equal canvas
*/
function drawImageProp(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x?: number, y?: number, w?: number, h?: number, offsetX?: number, offsetY?: number) {
    if (arguments.length === 2) {
        x = y = 0;
        w = ctx.canvas.width;
        h = ctx.canvas.height;
    }

    // default offset is center
    offsetX = typeof offsetX === "number" ? offsetX : 0.5;
    offsetY = typeof offsetY === "number" ? offsetY : 0.5;

    // keep bounds [0.0, 1.0]
    if (offsetX < 0) offsetX = 0;
    if (offsetY < 0) offsetY = 0;
    if (offsetX > 1) offsetX = 1;
    if (offsetY > 1) offsetY = 1;

    var iw = img.width,
        ih = img.height,
        r = Math.min(w! / iw, h! / ih),
        nw = iw * r,   // new prop. width
        nh = ih * r,   // new prop. height
        cx, cy, cw, ch, ar = 1;

    // decide which gap to fill    
    if (nw < w!) ar = w! / nw;                             
    if (Math.abs(ar - 1) < 1e-14 && nh < h!) ar = h! / nh;  // updated
    nw *= ar;
    nh *= ar;

    // calc source rectangle
    cw = iw / (nw / w!);
    ch = ih / (nh / h!);

    cx = (iw - cw) * offsetX;
    cy = (ih - ch) * offsetY;

    // make sure source rectangle is valid
    if (cx < 0) cx = 0;
    if (cy < 0) cy = 0;
    if (cw > iw) cw = iw;
    if (ch > ih) ch = ih;

    // fill image in dest. rectangle
    ctx.drawImage(img, cx, cy, cw, ch, x!, y!, w!, h!);
}

function cropAndOverlayDlcRibbon(imageOrUrl: string): Promise<string>{
	return new Promise<string>((resolve, reject) => {
		let img = new Image();
		img.crossOrigin = 'Anonymous';
		img.onload = () => {
			// 1. Create off-screen canvas and context
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d')!;
			
			// Header size
			canvas.width = headerWidth;
			canvas.height = headerHeight;

			// 2. Draw image onto canvas
			drawImageProp(ctx, img);

			let ribbon = new Image();
			ribbon.crossOrigin = 'Anonymous';
			ribbon.onload = () => {	
				ctx.drawImage(ribbon, 0, 0);

				resolve(canvas.toDataURL('image/png'));
			};

			ribbon.src = dlcRibbon;
		};
		
		img.onerror = (_, __, ___, ____, e) => reject(e);

		img.src = imageOrUrl;
	});
}

type CacheEvent = {
	type: "added" | "removed" | "updated";
	query: {
		queryKey: any[];
		state: {
			data?: any;
			dataUpdateCount: number;
			dataUpdatedAt: number; // Date.getTime()

			error: Error | null;
			errorUpdateCount: number;
			errorUpdatedAt: number; // Date.getTime()

			fetchFailureCount: 0;
			fetchFailureReason: Error | null;
			fetchMeta: null;
			fetchStatus: "idle";

			isInvalidated: boolean;
			status: "success" | "error";
		};
	};
};

const maxDlcs = 4096;

// DEV: figure out what is bypassCounter in MetadataModule and if we can use that too (maybe it's to avoid multiple requests or ripples?)

export interface AchievementsConfig extends ModuleConfig<AchievementsProviderConfigs>{
	category: boolean;
	app_details: boolean;
	overlay_menu: boolean;
	dlc_ribbon: boolean;
}

export interface AchievementsCache extends ModuleCache<AchievementsProviderCaches, AchievementsData>{

}

export interface AchievementsProviderConfigs{
	ra: RetroAchievementsAchievementsProviderConfig;
	rpcs3: RPCS3AchievementsProviderConfig;
	xenia: XeniaAchievementsProviderConfig;
	gog: GOGAchievementsProviderConfig;
}

export interface AchievementsProviderCaches{
	ra: RetroAchievementsAchievementsProviderCache;
	rpcs3: RPCS3AchievementsProviderCache;
	xenia: XeniaAchievementsProviderCache;
	gog: GOGAchievementsProviderCache;
}

export class AchievementsModule extends Module<"achievements", AchievementsProvider<any>>{
	identifier = "achievements" as const;
	title = t("moduleAchievements");

	logger: Logger = new Logger(this.identifier);

	public hasAchievementSetsSupport!: boolean; // Assigned in addMounts, not assigning because overrides addMounts otherwise
	private queryCache?: {
		getQueryCache(): {
			subscribe(callback: (event: CacheEvent) => void): () => void; // Returns function to call to unsubscribe
			notify(event: CacheEvent): void;
		};
		invalidateQueries(params: {
			queryKey: any[];
			exact?: boolean;
		}): any;
	}

	providers: AchievementsProvider<any>[] = [
		//new RetroAchievementsAchievementsProvider(this),
		//new RPCS3AchievementsProvider(this),
		new XeniaAchievementsProvider(this),
		//new GOGAchievementsProvider(this)
	];

	override async removeCache(appId: number, onlyProgress = false): Promise<void> {
		let dlcs = this.data[appId]?.dlcs?.length ?? 0;

		await super.removeCache(appId);

		if(!onlyProgress && this.hasAchievementSetsSupport && this.queryCache){
			// Remove achievements cache
			this.queryCache.invalidateQueries({
				queryKey: ["achievements", appId]
			});

			// Remove info cache for base game + dlcs
			this.queryCache.invalidateQueries({
				queryKey: ["StoreItem", "app_" + appId]
			});
			for(let i = 0; i < dlcs; i++){
				let id = this.packAppAndDlcIds(appId, i);

				this.queryCache.invalidateQueries({
					queryKey: ["StoreItem", "app_" + id]
				});

				await SteamClient.Apps.ClearCustomArtworkForApp(id, ELibraryAssetType.Header);
			}
		}

		let appData = appDetailsStore.GetAppData(appId);
		if (!appData?.details)
			return;

		stateTransaction(() => {
			appData.details!.achievements = {
				nAchieved: 0,
				nTotal: 0,
				vecAchievedHidden: [],
				vecHighlight: [],
				vecUnachieved: []
			};

			appDetailsCache.SetCachedDataForApp(appId, "achievements", 2, appData.details!.achievements);
		});
	}

	addMounts(mounts: Mounts): void {
		const module = this;

		async function replaceImages(achievements: AchievementsData['groups'][0]['achievements']){
			for(let achievement of achievements){
				achievement.strImage = achievement.strImageLocked
					?? (achievement.strImage ? await grayScaleIcon(achievement.strImage) : achievement.strImage);
			}
		}

		// DEV: What is this?
		// Maybe use SteamClient.Apps.GetMyAchievementsForApp?
		mounts.addPatchMount({
			patch(): Patch{
				const Achievements = findModuleExport(mProp => mProp?.m_mapMyAchievements);
				module.logger.debug("Achievements", Achievements);

				return replacePatch(
					Achievements.__proto__,
					"LoadMyAchievements",
					args => {
						if(!module.isValid || module.excludedApps.includes(args[0]))
							return callOriginal;

						if (appStore.GetAppOverviewByAppID(args[0])?.app_type === SteamAppTypeShortcut &&
							!Achievements.m_mapGlobalAchievements.has(args[0])){

							module.logger.debug("LoadMyAchievements");
								
							const data = module.fetchData(args[0]);
							if(data){
								let user: AllAchievements['data'] = {
									achieved: {},
									hidden: {},
									unachieved: {}
								};
								let global: GlobalAchievements['data'] = {};
								for(let group of data.groups){
									for(let achievement of group.achievements){
										if(achievement.bAchieved)
											user.achieved[achievement.strID] = achievement;
										else{
											// Replace the image with the locked one (we copy properties to avoid changing them),
											// we'll run them in another promise below
											achievement = { ...achievement };

											if(achievement.bHidden)
												user.hidden[achievement.strID] = achievement;
											else
												user.unachieved[achievement.strID] = achievement;
										}

										global[achievement.strID] = achievement.flAchieved;
									}
								}
								// Replace images with locked ones
								let hiddenOrUnachieved = Object.values(user.hidden)
									.concat(Object.values(user.unachieved));
								if(hiddenOrUnachieved.length)
									void replaceImages(hiddenOrUnachieved);

								Achievements.m_mapMyAchievements.set(args[0], {
									loading: false,
									data: user
								} as AllAchievements);
								Achievements.m_mapGlobalAchievements.set(args[0], {
									loading: false,
									data: global
								} as GlobalAchievements);
							}
							
							return;
						}

						return callOriginal;
					}
				);
			}
		});

		// Adds games to Library filter where achievements are supported
		mounts.addPatchMount({
			patch(): Patch
			{
				return replacePatch(
					// @ts-ignore
					appStore.allApps[0].__proto__,
					"BHasStoreCategory",
					function (args)
					{
						// @ts-ignore
						if (!module.isValid || !module.category || module.excludedApps.includes((this as SteamAppOverview).appid))
							return callOriginal;

						// @ts-ignore
						if ((this as SteamAppOverview).app_type == SteamAppTypeShortcut &&
							args[0] === StoreCategory.Achievements){

							// @ts-ignore
							const data = module.fetchData((this as SteamAppOverview).appid);
							if (data?.groups.some(g => g.achievements.length))
								return true;
						}

						return callOriginal;
					}
				);
			}
		});

		// Patching appDetailsStore.GetAchievements retrieves them only on app details,
		// while patching appDetailsStore.GetAppData retrieves them also on overlay
		function achievementsAppData(appId: number, appData: AppData){
			if(!appData.details || appData.details.achievements?.nTotal ||
				(appData.bLoadingAchievments && !module.hasCachedData(appId))){

				return;
			}

			// Start loading achievements and wait for them to finish
			appData.bLoadingAchievments = true;
			const data = module.fetchData(appId);
			if(!module.hasCachedData(appId))
				return;

			let achievements = data?.groups.flatMap(g => g.achievements);
			let achieved = achievements?.filter(a => a.bAchieved);
			const nAchieved = achieved?.length ?? 0;
			const nTotal = achievements?.length ?? 0;
			const vecHighlight = (achieved?.filter(a => !a.bHidden) ?? [])
				.slice(0, 12); // We limit highlighted achievements to 12
			const vecAchievedHidden = achievements
				?.filter(a => a.bAchieved && a.bHidden === true)
				?? [];
			// Replace the image with the locked one (we copy properties to avoid changing them),
			// we'll run them in another promise below
			const vecUnachieved = achievements
				?.filter(a => !a.bAchieved)
				.map(a => ({ ...a }))
				?? [];
			// Replace images with locked ones
			if(vecUnachieved.length)
				void replaceImages(vecUnachieved);

			stateTransaction(() => {
				appData.details!.achievements = {
					nAchieved,
					nTotal,
					vecAchievedHidden,
					vecHighlight,
					vecUnachieved
				};

				appDetailsCache.SetCachedDataForApp(appId, "achievements", 2, appData.details!.achievements);
			});
			appData.bLoadingAchievments = false;
		}
		// DEV: deprecated for future versions?
		mounts.addPatchMount({
			patch(): Patch{
				return beforePatch(
					appDetailsStore.__proto__,
					"GetAchievements",
					args => {
						if(!module.isValid || module.overlayMenu || module.excludedApps.includes(args[0]) ||
							appStore.GetAppOverviewByAppID(args[0]).app_type != SteamAppTypeShortcut){

							return;
						}

						module.logger.debug("GetAchievements");

						let appData = appDetailsStore.GetAppData(args[0]);
						achievementsAppData(args[0], appData);
					}
				);
			}
		});
		mounts.addPatchMount({
			patch(): Patch{
				return afterPatch(
					appDetailsStore.__proto__,
					"GetAppData",
					(args, appData: AppData) =>{
						if(!module.isValid || !module.overlayMenu || module.excludedApps.includes(args[0]) || !appData.details)
							return appData;

						const overview = appStore.GetAppOverviewByAppID(args[0]);
						if(overview.app_type != SteamAppTypeShortcut)
							return appData;

						achievementsAppData(args[0], appData);

						return appData;
					}
				);
			}
		});

		// Achievements section on app details page
		mounts.addPatchMount({
			patch(): Patch{
				const AppDetailsSections = findModuleExport((mProp) => (
					typeof mProp === 'function' && // class
					typeof mProp.prototype?.GetSections === 'function'
				));
				module.logger.debug("AppDetailsSections", AppDetailsSections);

				return afterPatch(AppDetailsSections.prototype, 'GetSections', function(this: any, _: Record<string, unknown>[], ret: Set<string>){
					const overview: SteamAppOverview = this?.props?.overview;
					if (module.isValid && overview?.app_type === SteamAppTypeShortcut && !module.excludedApps.includes(overview.appid)){
						if (module.appDetails)
							ret.add("achievements");
						else
							ret.delete("achievements");
					}

					return ret;
				});
			}
		});

		// Refresh achievements progress on overlay opened and app close,
		// clear cache and refetch
		let appCloseLifetimeHook: Hook;
		let overlayOpenLifetimeHook: Hook;
		async function clearProgressCache(appId: number){
			await module.removeCache(appId, true);

			if(module.hasAchievementSetsSupport && module.queryCache){
				module.queryCache.invalidateQueries({
					queryKey: ["achievements", appId, "user_achievements"],
					exact: true
				});
			}

			await module.fetchDataAsync(appId);
		}
		mounts.addMount({
			mount(){
				overlayOpenLifetimeHook = SteamClient.Overlay.RegisterForOverlayActivated((_, appId, active) => {
					if (!module.isValid || module.excludedApps.includes(appId))
						return;

					if(active && appStore.GetAppOverviewByAppID(appId).app_type == SteamAppTypeShortcut){
						setTimeout(() => void clearProgressCache(appId)); // Clear at the end of frame to avoid hiding the Achievements button
					}
				});
				appCloseLifetimeHook = SteamClient.GameSessions.RegisterForAppLifetimeNotifications(update =>{
					if (!module.isValid || module.excludedApps.includes(update.unAppID))
						return;

					if (!update.bRunning && appStore.GetAppOverviewByAppID(update.unAppID).app_type == SteamAppTypeShortcut)
						void clearProgressCache(update.unAppID);
				});
			},
			dismount(){
				overlayOpenLifetimeHook?.unregister();
				appCloseLifetimeHook?.unregister();
			}
		});

		// Support for achievement sets (now in beta)
		// DEV: need to reset Steam query cache in resetCache
		module.queryCache = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.getQueryCache === 'function'
		));
		(window as any).queryCache = module.queryCache;
		console.log("Cache", module.queryCache);
		const PlayerModule = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.GetGameAchievements === 'function'
		));
		console.log("PlayerModule", PlayerModule);
		const AppInfo = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.LoadAppInfoBatchFromLocalCache === 'function'
		));
		console.log("AppInfo", AppInfo, AppInfo.__proto__);
		if(PlayerModule && module.queryCache && PlayerModule.GetGameAchievements &&
			PlayerModule.GetGlobalAchievementPercentages &&
			PlayerModule.GetUserAchievements && AppInfo){

			module.hasAchievementSetsSupport = true;

			// DEV: maybe move all patches to getQueryCache?

			// Retrieve achievements
			type GetGameAchievementsType = {
				achievements: {
					internal_name: string; // Unique per game (not set)
					localized_name: string;
					localized_desc: string;
					icon: string;
					icon_gray: string;
					hidden: boolean;
					player_percent_unlocked: string; // ???
					internal_key: number; // Unique per game (not set)
					min_progress_int?: number;
					max_progress_int?: number;
					groupid?: number; // 0/undefined for base
					archived: boolean; // Should be false for events/timed achievements(?)
					progress_type: number; // Enum ???
					min_progress_float?: number;
					max_progress_float?: number;
				}[];
				schema_version: number; // Can be 0(?)
				groups: {
					groupid: number; // 0 is reserved for base game
					localized_name: string; // Localized name of group, should be "Base Game" for group id 0
					dlcappid: number; // 0 for none
					archived: boolean; // Should be false
					developeronly: boolean; // Should be false
					order: number; // 0-based, base game should be 0, and others can be sorted
					ispublic: boolean; // Should be true
					total_achievements: number;
					completion_achievements: number;
				}[];
				schema_hash: number; // Can be 0(?)
			};
			async function fetchGameAchievements(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetGameAchievements data", data);

				let i = 0;
				let j = 0;
				let result: GetGameAchievementsType = {
					achievements: [],
					schema_version: 0,
					groups: [],
					schema_hash: 0
				};

				if(data?.groups){
					for(let group of data.groups){
						let groupId = i++;

						if(groupId !== 0){
							result.groups.push({
								groupid: groupId,
								localized_name: group.name,
								dlcappid: (group.dlc != null && data.dlcs?.[group.dlc]) ?
									module.packAppAndDlcIds(appId, group.dlc) :
									0,
								archived: false,
								developeronly: false,
								order: groupId,
								ispublic: true,
								total_achievements: group.achievements.length,
								completion_achievements: group.achievements.length
							});
						}

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_name: achievement.strID,
								localized_name: achievement.strName,
								localized_desc: achievement.strDescription,
								icon: achievement.strImage,
								icon_gray: achievement.strImageLocked
									?? (achievement.strImage ? await grayScaleIcon(achievement.strImage) : achievement.strImage),
								hidden: achievement.bHidden,
								player_percent_unlocked: achievement.flAchieved.toString(),
								internal_key: j++,
								max_progress_int: achievement.flMaxProgress,
								min_progress_int: achievement.flMinProgress,
								groupid: groupId === 0 ? undefined : groupId,
								archived: false,
								progress_type: 0, // ???
								max_progress_float: achievement.flMaxProgress,
								min_progress_float: achievement.flMinProgress
							});
						}
					}
				}

				module.logger.debug("GetGameAchievements result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetGameAchievements", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;
						
						if(!module.isValid || !appId || module.excludedApps.includes(appId))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(appId);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;

						return fetchGameAchievements(appId, ret);
					});
				}
			});

			// Retrieve rarity
			type GetGlobalAchievementPercentagesType = {
				achievements: {
					internal_key: number;
					player_percent_unlocked: number; // flAchieved Percentage of players who achieved (0-100), min should be 0.1 by default
				}[];
				groups: {
					groupid: number;
					player_percent_completed: number; // Min of flAchieved of achievements in group
				}[];
			};
			async function fetchAchievementPercentages(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetGlobalAchievementPercentages data", data);

				let i = 0;
				let j = 0;
				let result: GetGlobalAchievementPercentagesType = {
					achievements: [],
					groups: []
				};
				if(data){
					for(let group of data.groups){
						result.groups.push({
							groupid: i++,
							player_percent_completed: group.achievements.length ? Math.min(...group.achievements.map(a => a.flAchieved || 0.1)) : 0
						});

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_key: j++,
								player_percent_unlocked: achievement.flAchieved || 0.1
							});
						}
					}
				}

				module.logger.debug("GetGlobalAchievementPercentages result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetGlobalAchievementPercentages", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;

						if(!module.isValid || !appId || module.excludedApps.includes(appId))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(appId);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;

						return fetchAchievementPercentages(appId, ret);
					});
				}
			});

			// Retrieve progress
			type GetUserAchievementsType = {
				achievements: {
					internal_key: number;
					unlocked: boolean;
					unlock_time: number;
					progress_int?: number;
					progress_float?: number;
				}[];
				schema_version: number;
				schema_hash: number;
				groups: {
					groupid: number,
					is_achievable: boolean,
					completed_achievements: number,
					is_completed: boolean, // Should be true if all completed
					time_completed: number; // Should be max unlock_time of all achievements in group
				}[];
			};
			async function fetchUserAchievements(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetUserAchievements data", data);

				let i = 0;
				let j = 0;
				let result: GetUserAchievementsType = {
					achievements: [],
					schema_version: 0,
					schema_hash: 0,
					groups: []
				};
				if(data){
					for(let group of data.groups){
						let completedAchievements = group.achievements.filter(a => a.bAchieved === true).length;
						result.groups.push({
							groupid: i++,
							is_achievable: group.dlc == null || data.dlcs?.[group.dlc]?.owned !== false,
							completed_achievements: completedAchievements,
							is_completed: completedAchievements === group.achievements.length,
							time_completed: (group.achievements.length && completedAchievements === group.achievements.length) ?
								Math.max(...group.achievements.map(a => a.rtUnlocked)) :
								0
						});

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_key: j++,
								unlocked: achievement.bAchieved,
								unlock_time: achievement.rtUnlocked,
								progress_int: achievement.flCurrentProgress,
								progress_float: achievement.flCurrentProgress
							});
						}
					}
				}

				module.logger.debug("GetUserAchievements result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetUserAchievements", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;

						if(!module.isValid || !appId || module.excludedApps.includes(appId))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(appId);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;

						return fetchUserAchievements(appId, ret);
					});
				}
			});

			type AchievementsSchemaType = {
				appid: number;
				groups: {
					achievements: {
						icon_achieved?: string;
						icon_unachieved?: string;
					}[];
				}[];
			};
			type AppDefaultInfo = {
				appid: number;
				success: number; // 1
				visible: boolean; // true
				name: string;
				type: number; // 0 game, 4 dlc
			}
			let cacheFixSubscription: () => void;
			const imageUrlRegex = /((?:https?:\/\/|data:image\/).+?)(?=https?:\/\/|data:image\/|$)/g;
			function isUnpatched(url?: string): boolean{
				let match = url?.match(imageUrlRegex);
				return !!match?.length && match.length > 1;
			}
			function patch(url: string): string{
				return url.match(imageUrlRegex)![1];
			}
			// Every branch in this patch should have a stop condition, not to cause loops when editing and re-sending the events
			mounts.addMount({
				mount(){
					cacheFixSubscription = module.queryCache!.getQueryCache().subscribe(event => {
						if(event.type !== 'added' && event.type !== 'updated')
							return;

						// Fix achievement icons urls
						if(event.query.queryKey.length >= 3 && event.query.queryKey[0] === "achievements" &&
							event.query.queryKey[2] === "schema" && event.query.state.data &&
							appStore.GetAppOverviewByAppID((event.query.state.data as AchievementsSchemaType).appid).app_type == SteamAppTypeShortcut &&
							(event.query.state.data as AchievementsSchemaType).groups
								.some(g => g.achievements.some(a => isUnpatched(a.icon_achieved) || isUnpatched(a.icon_unachieved)))){

							// Patch the urls
							for(let group of (event.query.state.data as AchievementsSchemaType).groups){
								for(let achievement of group.achievements){
									if(isUnpatched(achievement.icon_achieved))
										achievement.icon_achieved = patch(achievement.icon_achieved!);
									if(isUnpatched(achievement.icon_unachieved))
										achievement.icon_unachieved = patch(achievement.icon_unachieved!);
								}
							}

							event.query.state.dataUpdatedAt = new Date().getTime();

							// Send an update event, in case someone else is subscribed
							setTimeout(() => module.queryCache!.getQueryCache().notify(event));
						}

						// Add info about custom DLCs
						if(event.query.queryKey.length >= 3 && event.query.queryKey[0] === "StoreItem" &&
							(event.query.queryKey[1]?.toString?.() as string)?.startsWith("app_") &&
							event.query.queryKey[2] === "default_info" &&
							((event.query.state.data && !(event.query.state.data as AppDefaultInfo).name) ||
								event.query.state.error)){
							
							// Retrieve packed app and dlc ids
							let id = parseInt((event.query.queryKey[1].toString() as string).substring("app_".length) || "0", 10);
							if(id){
  								const [appId, dlcId] = module.unpackAppAndDlcIds(id);
								if(appStore.GetAppOverviewByAppID(appId)?.app_type == SteamAppTypeShortcut &&
									module.hasData(appId)){

									let data = module.fetchData(appId);
									if(data){
										let dlcInfo = data.dlcs?.[dlcId];
										if(dlcInfo){
											// Reset errors
											if(event.query.state.error){
												event.query.state.error = null;
												event.query.state.errorUpdateCount = 0;
												event.query.state.errorUpdatedAt = 0;

												event.query.state.fetchFailureCount = 0;
												event.query.state.fetchFailureReason = null;
											}

											event.query.state.data ??= {
												id: id,
												name: '',
												item_type: 0
											};
											(event.query.state.data as AppDefaultInfo).success = 1;
											(event.query.state.data as AppDefaultInfo).visible = true;
											if(dlcInfo.name)
												(event.query.state.data as AppDefaultInfo).name = dlcInfo.name;
											(event.query.state.data as AppDefaultInfo).type = 4;

											event.query.state.status = "success";
											event.query.state.dataUpdateCount = (event.query.state.dataUpdateCount ?? 0) + 1;
											event.query.state.dataUpdatedAt = new Date().getTime();

											// Send an update event, in case someone else is subscribed
											setTimeout(() => module.queryCache!.getQueryCache().notify(event));
										}
									}
								}
							}
						}
					});
				},
				dismount() {
					cacheFixSubscription();
				}
			});

			// Prevent retrieving info about shortcuts, since their appid might break serialization
			// jspb.BinaryConstants.TWO_TO_32
			mounts.addPatchMount({
				patch(): Patch{
					return replacePatch(AppInfo.__proto__, "LoadAppInfoBatchFromLocalCache", function(args: any[]){
						if(args.length && Array.isArray(args[0]) && args[0].some(a => a >= 2147483648))
							return Promise.resolve([]);
						else
							return callOriginal;
					});
				}
			});

			// Display info and custom images for DLCs
			mounts.addPatchMount({
				patch(): Patch{
					const patch = replacePatch((appStore as any).__proto__, "GetAppOverviewByAppID", function(args: any[]){
						const id = args[0] ?? 0;

						const [appId, dlcId] = module.unpackAppAndDlcIds(id);
						const appOverview = patch.original.bind(appStore)(appId) as SteamAppOverview;
						if(appOverview?.app_type != SteamAppTypeShortcut ||
							!module.hasData(appId)){

							return callOriginal;
						}

						let data = module.fetchData(appId);
						if(!data)
							return callOriginal;

						let dlcInfo = data.dlcs?.[dlcId];
						if(!dlcInfo)
							return callOriginal;

						return {
							app_type: SteamAppTypeShortcut, // Maybe DLC?
							gameid: id,
							appid: id,
							display_name: appOverview.display_name + ": " + dlcInfo.name,
							BHasCustomImages: () => false
						} as SteamAppOverview;
					});
					return patch;
				}
			});
			mounts.addPatchMount({
				patch(): Patch{
					return replacePatch(appDetailsStore.__proto__, "GetHeaderImages", function(args: any[]){
						const id = args[0]?.appid;

						const [appId, dlcId] = module.unpackAppAndDlcIds(id);
						if(appStore.GetAppOverviewByAppID(appId)?.app_type != SteamAppTypeShortcut ||
							!module.hasData(appId)){

							return callOriginal;
						}

						let data = module.fetchData(appId);
						if(!data)
							return callOriginal;

						let dlcInfo = data.dlcs?.[dlcId];
						if(!dlcInfo?.image)
							return callOriginal;

						return [ dlcInfo.image ];
					});
				}
			});
		}
		else
			module.hasAchievementSetsSupport = false;
	}

	progressDescription(data?: AchievementsData): string{
		if(data?.groups.length && data.groups.length > 1){
			return t("foundAchievementsSets")
				.replace("{num1}", data.groups.flatMap(g => g.achievements).length.toString())
				.replace("{num2}", data.groups.filter(g => g.achievements.length).length.toString());
		}
		else
			return t("foundAchievements").replace("{num}", (data?.groups.flatMap(g => g.achievements).length ?? 0).toString());
	}

	isEmpty(data: AchievementsData): boolean {
		return !data.groups.some(g => g.achievements.length);
	}
	
	protected override cacheData(appId: number, data: AchievementsData | null): void {
		// Achievements are never cached since they are already cached inside providers to be merged with progress
		this.notCachedData[appId] = data;
	}

	get category(): boolean
	{
		return this.config.category;
	}

	set category(category: boolean)
	{
		this.config.category = category;
		void this.saveConfig();
	}

	get appDetails(): boolean
	{
		return this.config.app_details;
	}

	set appDetails(app_details: boolean)
	{
		this.config.app_details = app_details;
		void this.saveConfig();
	}

	get overlayMenu(): boolean
	{
		return this.config.overlay_menu;
	}

	set overlayMenu(overlay_menu: boolean)
	{
		this.config.overlay_menu = overlay_menu;
		void this.saveConfig();
	}

	get dlcRibbon(): boolean
	{
		return this.config.dlc_ribbon;
	}

	set dlcRibbon(dlc_ribbon: boolean)
	{
		let current = this.dlcRibbon;
		this.config.dlc_ribbon = dlc_ribbon;
		void this.saveConfig();

		if(current != dlc_ribbon)
			void this.clearCache();
	}

	override icon = <FaClipboardCheck/>; // In honor of Emuchievements

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [category, setCategory] = useState(this.category);
		const [appDetails, setAppdetails] = useState(this.appDetails);
		const [overlayMenu, setOverlayMenu] = useState(this.appDetails);
		const [dlcRibbon, setDlcRibbon] = useState(this.dlcRibbon);

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("achievementsSettingsCategory")}
						description={t("achievementsSettingsCategoryDesc")}>
						<Toggle
							value={category}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setCategory(checked);
								this.category = checked;
							}}/>
					</Field>
					<Field
						label={t("achievementsSettingsAppDetails")}
						description={t("achievementsSettingsAppDetailsDesc")}>
						<Toggle
							value={appDetails}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setAppdetails(checked);
								this.appDetails = checked;
							}}/>
					</Field>
					<Field
						label={t("achievementsSettingsOverlay")}
						description={t("achievementsSettingsOverlayDesc")}>
						<Toggle
							value={overlayMenu}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setOverlayMenu(checked);
								this.overlayMenu = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				{
					this.hasAchievementSetsSupport && <DialogControlsSection>
						<Field
							label={t("achievementsSettingsDlcRibbon")}
							description={t("achievementsSettingsDlcRibbonDesc")}>
							<Toggle
								value={dlcRibbon}
								disabled={loadingData.loading}
								onChange={(checked) => {
									setDlcRibbon(checked);
									this.dlcRibbon = checked;
								}}/>
						</Field>
					</DialogControlsSection>
				}
			</>
		);
	};

	public removeAchievementsSchema(appId: number){
		this.queryCache?.invalidateQueries({
			queryKey: ["achievements", appId, "schema"],
			exact: true
		});
	}
	public clearAchievementsSchema(){
		if(!this.queryCache)
			return;

		for (let appId of this.state.apps){
			this.removeAchievementsSchema(+appId);
		}
	}

	public packAppAndDlcIds(appId: number, dlcId: number): number{
		return (appId * maxDlcs + dlcId);
	}

	public unpackAppAndDlcIds(id: number): [number, number]{
		return [
			Math.floor(id / maxDlcs),
			id % maxDlcs
		];
	}

	override async fetchDataAsync(appId: number): Promise<AchievementsData | undefined> {
		let data = await super.fetchDataAsync(appId);

		if(data?.dlcs?.length && this.dlcRibbon){
			for(let dlc of data.dlcs){
				if(dlc.image)
					dlc.image = await cropAndOverlayDlcRibbon(dlc.image);
			}
		}

		return data;
	}

	override applyDetails(details: SteamAppDetails): Promise<void> {
		if(this.excludedApps.includes(details.unAppID))
			return Promise.resolve();

		const data = this.getCachedData(details.unAppID);
		if(data?.dlcs?.length){
			details.vecDLC = data.dlcs.map((d, i) => ({
				bAvailableOnStore: false,
				bEnabled: d.owned !== false,
				lDiskUsageBytes: 0,
				rtPurchaseDate: 0,
				rtStoreAssetModifyType: 0,
				strHeaderFilename: '',
				strName: d.name,
				strState: d.owned !== false ? 'installed' : 'notinstalled',
				unAppID: this.packAppAndDlcIds(details.unAppID, i)
			}));
		}

		return Promise.resolve();
	}

	// applyOverview not used apparently...
}