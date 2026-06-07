(function(){
  var MOBILE_BREAK = 1180;
  var navbars = [];

  function closeNavbar(navbar){
    var toggle = navbar.querySelector('.mobile-nav-toggle');
    navbar.classList.remove('nav-open');
    if(toggle){
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '&#9776;';
    }
    document.body.classList.remove('nav-menu-open');
  }

  function setupMobileNav(){
    document.querySelectorAll('.navbar').forEach(function(navbar){
      if(navbar.querySelector('.mobile-nav-toggle')) return;

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'mobile-nav-toggle';
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '&#9776;';

      var brand = navbar.querySelector('.brand');
      if(brand && brand.nextSibling){
        brand.parentNode.insertBefore(toggle, brand.nextSibling);
      }else{
        navbar.insertBefore(toggle, navbar.firstChild);
      }

      toggle.addEventListener('click', function(e){
        e.stopPropagation();
        var open = navbar.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.innerHTML = open ? '&#10005;' : '&#9776;';
        document.body.classList.toggle('nav-menu-open', open);
      });

      navbar.querySelectorAll('.nav-links a').forEach(function(link){
        link.addEventListener('click', function(){
          closeNavbar(navbar);
        });
      });

      navbars.push(navbar);
    });

    if(!document.documentElement.dataset.mobileNavBound){
      document.documentElement.dataset.mobileNavBound = '1';

      document.addEventListener('click', function(e){
        navbars.forEach(function(navbar){
          if(!navbar.classList.contains('nav-open')) return;
          if(!navbar.contains(e.target)) closeNavbar(navbar);
        });
      });

      window.addEventListener('resize', function(){
        if(window.innerWidth > MOBILE_BREAK){
          navbars.forEach(closeNavbar);
        }
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupMobileNav);
  }else{
    setupMobileNav();
  }
})();
