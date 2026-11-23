FROM nginx:alpine

# Copiar archivos de la aplicacion al directorio web de Nginx
COPY . /usr/share/nginx/html

# Exponer el puerto web estandar
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
