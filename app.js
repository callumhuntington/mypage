$(window).scroll(function() {    
    var blockscroll = $(window).scrollTop();
    if (blockscroll >= $(window).height()*0.05) {
        $(".image").addClass("scrolling");
    } else {
        $(".image").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-bar a").addClass("scrolling");
    } else {
        $(".nav-bar a").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-bar").addClass("scrolling");
    } else {
        $(".nav-bar").removeClass("scrolling");
    }
    if (blockscroll >= $(window).height()*0.05) {
        $(".nav-links").addClass("scrolling");
    } else {
        $(".nav-links").removeClass("scrolling");
    }
});

$(document).ready(function() {
  // Smooth scrolling for all anchor links
  $("a[href^='#']").on('click', function(event) {
    // Only handle anchors with a hash
    if (this.hash !== "") {
      event.preventDefault();
      var hash = this.hash;

      // Get current navbar height (will update on resize)
      var navHeight = $('.nav-bar').outerHeight();

      // Animate scroll
      $('html, body').animate({
        scrollTop: $(hash).offset().top - navHeight
      }, 800);
    }
  });
});
