
// Close nav on Mobile when Link is clicked
document.querySelectorAll('.nav-links a').forEach(function(link){
  link.addEventListener('click', function(){
    document.querySelector('.nav-links').classList.remove('open');
  });
});
// Close when clicking outside the nav
document.addEventListener('click', function(e){
  var nav = document.querySelector('nav');
  if(nav && !nav.contains(e.target)){
    document.querySelector('.nav-links').classList.remove('open');
  }
});
