FROM nginx:alpine

# Copiar configuracion optimizada de Nginx con proxy directo al BCV
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos de la aplicacion al directorio web de Nginx
COPY . /usr/share/nginx/html

# Exponer el puerto web estandar
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
