-- 024_default_admin.sql
-- Actualiza las credenciales del admin por defecto al correo y contraseña
-- definitivos para Mangueras del Sur.
-- Password: "Manguerasdelsur*" → SHA-256

UPDATE users
   SET email         = 'manguerasdelsur@admin.local',
       password_hash = '40d07658fcb540891697c6e7a8504cce32ac1951b4c1e06f2ec830bf564ee45f'
 WHERE id = 1;
