use wasm_bindgen::prelude::*;
use vtracer::{ColorImage, Config, Preset};

#[wasm_bindgen]
pub fn vectorize_rgba(pixels: &[u8], width: u32, height: u32, simplify: f64) -> Result<String, JsValue> {
    if width == 0 || height == 0 || pixels.len() != width as usize * height as usize * 4 {
        return Err(JsValue::from_str("Dimensions ou données RGBA incorrectes"));
    }
    let img = ColorImage {
        pixels: pixels.to_vec(),
        width: width as usize,
        height: height as usize,
    };
    let mut cfg = Config::from_preset(Preset::Poster);
    cfg.simplify = if simplify > 0.0 { Some(simplify) } else { None };
    cfg.build()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .to_svg(&img)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
