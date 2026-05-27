/**
 * Cuerpo en español de `/cookies`. Traducción de `CookiesEn.tsx`
 * referenciando expresamente el art. 22.2 LSSI y la guía AEPD de julio
 * de 2023 sobre medición sin cookies.
 */
export function CookiesEs() {
  return (
    <>
      <section>
        <h2>Resumen</h2>
        <p>
          Montana usa <strong>solo cookies estrictamente necesarias</strong>:
          las que se requieren para autenticarte y mantener tu sesión
          iniciada. No usamos cookies publicitarias, de marketing, de
          perfilado ni de seguimiento de terceros. Por eso no hay banner
          de &laquo;Aceptar cookies&raquo; — según el art. 22.2 de la LSSI
          y la Directiva ePrivacy de la UE, no se requiere consentimiento
          para cookies estrictamente necesarias.
        </p>
      </section>

      <section>
        <h2>1. ¿Qué es una cookie?</h2>
        <p>
          Una cookie es un pequeño archivo de texto que tu navegador
          guarda. Permite que un sitio recuerde estado entre peticiones.
          Tecnologías similares (localStorage, sessionStorage, IndexedDB)
          están sujetas a las mismas reglas y reciben el mismo
          tratamiento en esta política.
        </p>
      </section>

      <section>
        <h2>2. Cookies que utilizamos</h2>
        <table className="legal__table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Finalidad</th>
              <th>Tipo</th>
              <th>Duración</th>
              <th>Proveedor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>sb-access-token</code>
              </td>
              <td>Mantiene tu sesión iniciada (JWT de acceso)</td>
              <td>Estrictamente necesaria</td>
              <td>Sesión / 1 hora</td>
              <td>Supabase (propia)</td>
            </tr>
            <tr>
              <td>
                <code>sb-refresh-token</code>
              </td>
              <td>Renueva tu sesión cuando expira el token de acceso</td>
              <td>Estrictamente necesaria</td>
              <td>Hasta 30 días</td>
              <td>Supabase (propia)</td>
            </tr>
            <tr>
              <td>
                <code>montana.consent</code>
              </td>
              <td>
                Recuerda que has visto el aviso legal para no mostrarlo
                de nuevo
              </td>
              <td>Estrictamente necesaria</td>
              <td>12 meses (localStorage)</td>
              <td>Propia</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. Analítica</h2>
        <p>
          Usamos <strong>Vercel Web Analytics</strong> y{' '}
          <strong>Vercel Speed Insights</strong>. Ambas son{' '}
          <em>sin cookies</em>: miden páginas vistas y rendimiento de
          forma agregada sin escribir cookies, sin fingerprinting y sin
          persistir identificadores personales. Según la guía de la AEPD
          de julio de 2023, la medición agregada sin cookies de este tipo
          no requiere consentimiento previo.
        </p>
      </section>

      <section>
        <h2>4. Terceros</h2>
        <p>
          Las teselas del mapa las sirve <strong>MapTiler</strong>. Sus
          servidores reciben tu IP y las teselas que pides, pero este
          tráfico no establece ninguna cookie en tu navegador. El
          almacenamiento de Supabase sirve las fotos subidas por los
          usuarios del mismo modo.
        </p>
      </section>

      <section>
        <h2>5. Cómo controlar las cookies</h2>
        <p>
          Como solo usamos cookies estrictamente necesarias, bloquearlas
          en tu navegador cerrará tu sesión y te impedirá usar la app.
          Puedes eliminarlas en cualquier momento desde los ajustes de
          tu navegador.
        </p>
        <p>
          Si en el futuro añadiéramos cookies no esenciales, mostraríamos
          un banner de consentimiento adecuado antes de establecerlas y
          te ofreceríamos controles granulares.
        </p>
      </section>

      <section>
        <h2>6. Cambios</h2>
        <p>
          La fecha de &laquo;Última actualización&raquo; al inicio refleja
          la última revisión. Notificaremos los cambios sustanciales
          dentro de la app.
        </p>
      </section>
    </>
  );
}
