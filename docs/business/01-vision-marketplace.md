# 01 — Visión del marketplace

## El problema que resolvemos

**Para el comprador**: encontrar producto artesanal real, de calidad, con origen verificable, es hoy un trabajo a tiempo parcial. Las opciones actuales fallan así:

- **Ecommerce generalista (Amazon, marketplaces grandes)**: ruido masivo, falsificaciones, "artesanal" como etiqueta vacía, sin trazabilidad real, fotos de stock, devoluciones agresivas que el productor pequeño no puede absorber.
- **Tiendas online del propio productor**: a menudo precarias (Shopify abandonado, WhatsApp como checkout, fotos malas), inversión en confianza desigual, descubrimiento cero. El producto puede ser excelente y el comprador no llega nunca.
- **Mercados físicos**: solo accesibles en geografía y tiempo concreto. Excluyen al comprador urbano que tiene poco tiempo.
- **Instagram como tienda**: discovery sí, transacción no. DMs, "te paso bizum", sin garantías.

El comprador termina **eligiendo no comprar**, o eligiendo un producto industrial que sabe que no quería.

**Para el productor artesanal**: vender online a desconocidos cuesta más de lo que parece. Ficha decente, fotos, logística, atención, pasarela, devoluciones, fiscalidad. La mayoría de productores buenos **producen bien y venden mal**. Las plataformas existentes les piden o bien ser tienda online completa (carga gigante) o aceptar marketplaces gigantes con comisiones agresivas y reglas que no protegen al pequeño.

## Para quién

### Comprador objetivo

| Atributo | Detalle |
|---|---|
| Edad | 28–55, pico 35–50 |
| Ingreso | Disponible para gasto discrecional en alimentación / regalo de calidad |
| Geografía | Urbana / periurbana, España (al inicio) |
| Dispositivo | Móvil dominante; descubre y compra desde el teléfono |
| Motivación | Origen, calidad, regalo, autocuidado, "comprar mejor menos" |
| Sensibilidad al precio | Media-baja **si** hay confianza. Alta si percibe "tienda random". |
| Frecuencia esperada | Compra puntual primero; recurrencia si la primera experiencia es muy buena |

**No es nuestro comprador**:
- Quien busca el precio mínimo de un commodity.
- Quien compra al peso de forma industrial (HORECA en frío — caso aparte, fuera de scope al inicio).
- El "foodie influencer" que solo busca contenido — útil para growth, no es target económico.

### Productor objetivo

Ver `02-productores-ideales.md` para detalle. En resumen: pequeño, real, con producto vivo, capacidad de cumplir y disposición a aceptar curaduría.

## Por qué ahora

1. **El comprador ya está predispuesto.** El movimiento "comer mejor / consumo consciente / km 0" lleva años creciendo. La pandemia aceleró el consumo online de alimentación premium. La inflación 2022–2024 dejó al comprador medio cansado del producto industrial barato pero malo y, paradójicamente, dispuesto a pagar más por menos cantidad de algo bueno.
2. **El productor artesanal está accesible.** Hay una generación de productores con presencia en redes sociales pero sin tienda online seria. Son alcanzables (DM, email, WhatsApp), saben fotografiar mejor que hace 10 años, y aceptan acuerdos comerciales más rápido que un productor "establecido".
3. **La infraestructura es barata.** Stripe, hosting moderno, transportistas con APIs decentes, generadores de etiquetas. Montar un marketplace digno con un equipo pequeño es viable hoy; hace 10 años no.
4. **Los marketplaces grandes están perdiendo confianza.** Falsificaciones, reseñas falsas, opacidad de origen. Hay un hueco emocional para algo lento, claro y honesto.

Si esperamos 3 años, el hueco probablemente lo ocupa otro. Si entramos demasiado pronto sin curaduría, no lo aprovechamos.

## Qué nos diferencia de un ecommerce normal

| Eje | Ecommerce normal | Nosotros |
|---|---|---|
| Catálogo | Cuanto más mejor | Pequeño, curado, defendible |
| Onboarding de vendedor | Self-service total | Asistido y validado a mano |
| Fotos | Las del proveedor | Validadas / hechas por nosotros |
| Producto | Inventario propio o agregación | Producción real, con persona detrás |
| Precio | Competir a la baja | Sostener el precio justo del productor |
| Discovery | SEO masivo + paid | Editorial + boca a boca + producto memorable |
| Confianza | Reviews y devoluciones | Trazabilidad y atención humana |
| Logística | Centralizada / Prime-style | Dropshipping del productor (al inicio) |
| Promesa | "Lo encuentras todo" | "Lo que está aquí, vale la pena" |

La pregunta clave que separa: **¿el catálogo crece añadiendo SKUs o curando productores?** Si es lo primero, eres ecommerce. Si es lo segundo, eres marketplace curado.

## Qué NO queremos ser

- **No queremos ser Amazon.** No competimos en surtido ni velocidad.
- **No queremos ser un agregador (estilo "directorio de productores").** Si solo enlazamos a tiendas externas, no protegemos al comprador y no podemos defender la calidad.
- **No queremos ser una marca propia que revende.** Eso requiere stock, capital y un equipo de operaciones que no tenemos. Cambia el modelo entero.
- **No queremos ser un Etsy generalista.** Etsy es self-service y vertical-agnóstico. Nosotros somos curado y vertical concreto.
- **No queremos ser una red social.** Cero feeds, cero followers, cero gamificación. La transacción es el centro; el contenido sirve al producto.
- **No queremos ser internacionales al día uno.** España primero, mercado adyacente solo cuando España esté validada.
- **No queremos ser una plataforma de servicios.** Solo producto físico.
- **No queremos ser un marketplace B2B.** El comprador objetivo es final, no horeca ni distribuidor.

## Promesa de marca (cómo se mide)

| Promesa | Cómo se hace verificable |
|---|---|
| "El productor existe y es real" | Foto y nombre en cada ficha + página de productor con historia, ubicación y proceso. |
| "El producto es como en la foto" | Fotos hechas por nosotros o validadas. Cero stock photo. |
| "Si algo va mal, hay alguien al otro lado" | Atención humana en ≤ 24h hábiles; política de devolución clara. |
| "Comprar es rápido en el móvil" | Checkout en ≤ 3 pasos visibles; sin registro obligatorio antes de pagar. |
| "El precio es el precio" | Envío e impuestos visibles antes del último paso. |

## Norte estratégico

**No optimizamos GMV ni nº de productores. Optimizamos pedidos repetidos en compradores que descubrieron el marketplace en frío.**

Si esa métrica no se mueve, ninguna otra importa. Si se mueve, todo lo demás sigue.

## Hipótesis de fondo (que validamos en los próximos 6 meses)

1. **Hipótesis de demanda**: existe demanda online suficiente de producto artesanal premium curado en categorías con ticket medio 25–80 € para sostener al menos 50 pedidos / semana en mes 6.
2. **Hipótesis de confianza**: una ficha bien hecha (foto + storytelling + transparencia) convierte ≥ 3× mejor que una ficha promedio de marketplace generalista para el mismo producto.
3. **Hipótesis de productor**: existen productores accesibles (≥ 30 contactables en cada categoría inicial) que aceptan comisión 20–30% a cambio de discovery + checkout + atención.
4. **Hipótesis de operaciones**: el modelo dropshipping desde productor es manejable hasta ~300 pedidos / semana sin centralizar logística.

Cada hipótesis tiene métricas concretas en `08-roadmap-negocio.md`. Si alguna se cae, el plan se replantea.
