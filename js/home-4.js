
document.querySelectorAll(".nav-links a").forEach(function(l){
  l.addEventListener("click",function(){ document.querySelector(".nav-links").classList.remove("open"); });
});
document.addEventListener("click",function(e){
  var nav=document.querySelector("nav");
  if(nav && !nav.contains(e.target)){ var nl=document.querySelector(".nav-links"); if(nl) nl.classList.remove("open"); }
});
