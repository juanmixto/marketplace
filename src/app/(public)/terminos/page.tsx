import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description: 'Términos y condiciones de uso de Mercado Productor.',
  robots: { index: false, follow: true },
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-foreground mb-4">Términos y Condiciones</h1>
        <p className="text-foreground-soft text-sm mb-8">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Objeto del servicio</h2>
            <p className="text-foreground-soft">
              Mercado Productor es una plataforma de comercio electrónico que conecta productores agrícolas locales (vendedores) con consumidores. Actuamos como intermediarios, facilitando las transacciones pero sin ser parte en las mismas.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Registro y cuenta de usuario</h2>
            <p className="text-foreground-soft">
              Para realizar compras o vender en la plataforma es necesario registrarse. El usuario garantiza que los datos proporcionados son verídicos y se compromete a mantenerlos actualizados. Cada usuario es responsable de la confidencialidad de sus credenciales de acceso.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Proceso de compra</h2>
            <p className="text-foreground-soft">
              El proceso de compra comprende: selección de productos, cumplimentación de datos de envío, confirmación del pedido y pago. Una vez confirmado el pedido, recibirás un email de confirmación. Los precios mostrados incluyen IVA aplicable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Condiciones para vendedores</h2>
            <p className="text-foreground-soft">
              Los vendedores deben ser productores o artesanos locales y cumplir con la normativa alimentaria y comercial vigente. Mercado Productor aplica una comisión por cada venta realizada. Los vendedores son responsables de la exactitud de las descripciones de sus productos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Política de devoluciones</h2>
            <p className="text-foreground-soft">
              El comprador dispone de 14 días desde la recepción para ejercer su derecho de desistimiento conforme a la normativa de consumidores. Los productos perecederos o personalizados pueden quedar excluidos de este derecho según lo establecido en el artículo 103 del Real Decreto Legislativo 1/2007.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">6. Limitación de responsabilidad</h2>
            <p className="text-foreground-soft">
              Mercado Productor no es responsable de los daños derivados del uso indebido de la plataforma, de la calidad de los productos vendidos por terceros, ni de retrasos en la entrega imputables a transportistas. Los vendedores son responsables directos de sus productos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">7. Resolución de disputas</h2>
            <p className="text-foreground-soft">
              En caso de disputa entre comprador y vendedor, Mercado Productor ofrece un servicio de mediación. Los consumidores también pueden acudir a la plataforma de resolución de litigios en línea de la Comisión Europea (ODR).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">8. Legislación aplicable</h2>
            <p className="text-foreground-soft">
              Los presentes términos se rigen por la legislación española, incluyendo el Real Decreto Legislativo 1/2007 (Ley General para la Defensa de los Consumidores), la Ley 34/2002 de Servicios de la Sociedad de la Información y el Reglamento (UE) 2016/679 (RGPD).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">9. Contacto</h2>
            <div className="bg-surface-raised p-4 rounded-lg">
              <p className="text-foreground-soft text-sm">Para cualquier consulta: <strong>legal@marketplace.local</strong></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
