-- 007_settings_extended.sql
-- Amplía la tabla settings con configuraciones de negocio genéricas:
-- identidad visual, contacto, ticket y preferencias de app.
-- INSERT OR IGNORE: nunca pisa valores que el usuario ya haya guardado.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  -- Identidad
  ('business_email',       '',           'string',  'business',  'Correo electronico de contacto'),
  ('business_website',     '',           'string',  'business',  'Sitio web del negocio'),
  ('business_city',        '',           'string',  'business',  'Ciudad / municipio'),
  ('business_country',     'Guatemala',  'string',  'business',  'Pais'),
  ('business_logo_base64', '',           'string',  'business',  'Logo en base64 (data URL completa)'),

  -- Ticket / impresion
  ('ticket_footer_line1',  '',           'string',  'ticket',    'Primera linea del pie de ticket'),
  ('ticket_footer_line2',  '',           'string',  'ticket',    'Segunda linea del pie de ticket'),
  ('ticket_show_logo',     '1',          'boolean', 'ticket',    'Mostrar logo en el ticket impreso'),
  ('ticket_show_tax',      '1',          'boolean', 'ticket',    'Desglosar IVA en el ticket'),
  ('ticket_copies',        '1',          'number',  'ticket',    'Copias a imprimir por venta'),

  -- Apariencia / app
  ('app_name',             'SerProMec',  'string',  'app',       'Nombre que aparece en la barra lateral y titulo'),
  ('app_accent_color',     '#e5001f',    'string',  'app',       'Color de acento principal (hex)');
