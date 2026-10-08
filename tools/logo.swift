// Geometría del logo para tools/logo.py: une formas con CoreGraphics y dibuja el ícono PNG.
// Entrada (JSON por la entrada estándar): las formas del nombre, de la silueta y de la cara del camión, el ancho del
// trazo del contorno y los datos del PNG. Salida (JSON): cada forma ya unida, como trazado SVG, y sus cajas.
import CoreGraphics
import Foundation
import ImageIO

func numero(_ v: Any) -> CGFloat { CGFloat((v as! NSNumber).doubleValue) }

func camino(_ cmds: [[Any]]) -> CGMutablePath {
  let p = CGMutablePath()
  for c in cmds {
    let n = c.dropFirst().map(numero)
    switch c[0] as! String {
    case "M": p.move(to: CGPoint(x: n[0], y: n[1]))
    case "L": p.addLine(to: CGPoint(x: n[0], y: n[1]))
    case "C": p.addCurve(to: CGPoint(x: n[4], y: n[5]), control1: CGPoint(x: n[0], y: n[1]), control2: CGPoint(x: n[2], y: n[3]))
    default: p.closeSubpath()
    }
  }
  return p
}

func f(_ v: CGFloat) -> String {
  var s = String(format: "%.2f", Double(v))
  while s.hasSuffix("0") { s.removeLast() }
  if s.hasSuffix(".") { s.removeLast() }
  return s == "-0" ? "0" : s
}

func svg(_ p: CGPath) -> String {
  var out = ""
  p.applyWithBlock { e in
    let q = e.pointee.points
    switch e.pointee.type {
    case .moveToPoint: out += "M\(f(q[0].x)) \(f(q[0].y))"
    case .addLineToPoint: out += "L\(f(q[0].x)) \(f(q[0].y))"
    case .addQuadCurveToPoint: out += "Q\(f(q[0].x)) \(f(q[0].y)) \(f(q[1].x)) \(f(q[1].y))"
    case .addCurveToPoint: out += "C\(f(q[0].x)) \(f(q[0].y)) \(f(q[1].x)) \(f(q[1].y)) \(f(q[2].x)) \(f(q[2].y))"
    case .closeSubpath: out += "Z"
    @unknown default: break
    }
  }
  return out
}

func caja(_ p: CGPath) -> [Double] {
  let b = p.boundingBoxOfPath
  return [b.minX, b.minY, b.width, b.height].map { Double($0) }
}

/// Une una lista de formas; cada una trae sus órdenes y si se rellena con la regla par-impar.
func union(_ formas: Any?) -> CGPath {
  var total: CGPath = CGMutablePath()
  for item in formas as! [[String: Any]] {
    let par = (item["par"] as? Bool) ?? false
    total = total.union(camino(item["c"] as! [[Any]]).normalized(using: par ? .evenOdd : .winding), using: .winding)
  }
  return total
}

let datos = try! JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as! [String: Any]
let nombre = union(datos["nombre"])
let silueta = union(datos["silueta"])
let cara = union(datos["cara"])
let camion = silueta.union(cara, using: .winding)
// El contorno del original es un trazo «por fuera»: aquí queda como forma (el camión más medio trazo alrededor)
let contorno = { (ancho: CGFloat) -> CGPath in
  camion.union(camion.copy(strokingWithWidth: ancho, lineCap: .round, lineJoin: .round, miterLimit: 4), using: .winding)
}
let azul = contorno(numero(datos["trazo"]!))

// Ícono PNG: el camión (sin contorno) centrado sobre el azul de la marca
if let png = datos["png"] as? [String: Any] {
  let lado = Int(numero(png["lado"]!))
  let color = { (k: String) -> CGColor in
    let c = (png[k] as! [Any]).map(numero)
    return CGColor(srgbRed: c[0], green: c[1], blue: c[2], alpha: 1)
  }
  let espacio = CGColorSpace(name: CGColorSpace.sRGB)!
  let ctx = CGContext(data: nil, width: lado, height: lado, bitsPerComponent: 8, bytesPerRow: 0, space: espacio, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(color("fondo"))
  ctx.fill(CGRect(x: 0, y: 0, width: lado, height: lado))
  let b = camion.boundingBoxOfPath
  let escala = CGFloat(lado) * numero(png["ancho"]!) / b.width
  ctx.translateBy(x: 0, y: CGFloat(lado))
  ctx.scaleBy(x: 1, y: -1)  // y hacia abajo, como en el SVG
  ctx.translateBy(x: (CGFloat(lado) - b.width * escala) / 2, y: (CGFloat(lado) - b.height * escala) / 2)
  ctx.scaleBy(x: escala, y: escala)
  ctx.translateBy(x: -b.minX, y: -b.minY)
  ctx.saveGState()
  ctx.addPath(silueta)
  ctx.clip()
  let degradado = CGGradient(colorsSpace: espacio, colors: [color("c1"), color("c2")] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(degradado, start: CGPoint(x: b.midX, y: numero(png["y1"]!)), end: CGPoint(x: b.midX, y: numero(png["y2"]!)), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
  ctx.restoreGState()
  ctx.addPath(cara)
  ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
  ctx.fillPath()
  let destino = CGImageDestinationCreateWithURL(URL(fileURLWithPath: png["ruta"] as! String) as CFURL, "public.png" as CFString, 1, nil)!
  CGImageDestinationAddImage(destino, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(destino)
}

let salida: [String: Any] = [
  "nombre": svg(nombre), "silueta": svg(silueta), "cara": svg(cara), "azul": svg(azul),
  "cajas": ["nombre": caja(nombre), "camion": caja(azul), "volumen": caja(camion)],
]
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: salida))
