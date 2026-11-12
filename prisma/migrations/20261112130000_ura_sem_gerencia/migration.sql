-- Gerência sai do menu da URA (pedido de 12/11/2026). Apaga só a opção do
-- menu que levava pra Gerência — usuários, conversas e histórico não mudam.
DELETE FROM "ura_menu_options" WHERE "targetDepartment" = 'GERENCIA';
