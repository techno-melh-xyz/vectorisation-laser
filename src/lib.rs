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

    // Inspiré des usages recommandés de VTracer pour des dessins scannés
    // ou photographiés en noir et blanc : preset BW + filtrage des petites taches.
    let mut cfg = Config::from_preset(Preset::Bw);
    cfg.filter_speckle = 12;
    cfg.length_threshold = 3.5;
    cfg.corner_threshold = 55;
    cfg.splice_threshold = 45;
    cfg.path_precision = Some(2);
    cfg.simplify = if simplify > 0.0 { Some(simplify) } else { None };

    cfg.build()
        .map_err(|e| JsValue::from_str(&e.to_string()))?
        .to_svg(&img)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
