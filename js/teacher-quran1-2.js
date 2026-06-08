
// إغلاق الـ nav على الموبايل عند الضغط على رابط
document.querySelectorAll('.nav-links a').forEach(function(link){
  link.addEventListener('click', function(){
    document.querySelector('.nav-links').classList.remove('open');
  });
});
// إغلاق عند الضغط خارج الـ nav
document.addEventListener('click', function(e){
  var nav = document.querySelector('nav');
  if(nav && !nav.contains(e.target)){
    document.querySelector('.nav-links').classList.remove('open');
  }
});
